// iNaturalist : résolveur d'image de référence par espèce, avec cache JSON.
// Patron « identifier puis jeter » : on stocke URL + métadonnées de licence,
// JAMAIS le fichier. Cache TTL différencié : 21 j pour les succès, 7 j pour
// les négatifs.

const BASE = 'https://api.inaturalist.org/v2';
const USER_AGENT = 'almanach-val-des-loups/0.1 (+https://github.com/mca-labs/almanach)';
const MIN_INTERVAL_MS = 1100;
const TTL_OK_DAYS = 21;
const TTL_NEGATIVE_DAYS = 7;
const ACCEPTED_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-nc', 'pd']);

const PHOTO_FIELDS =
  'id:!t,license_code:!t,attribution:!t,attribution_name:!t,url:!t,square_url:!t,medium_url:!t';
const TAXON_FULL_FIELDS = `(id:!t,name:!t,rank:!t,preferred_common_name:!t,default_photo:(${PHOTO_FIELDS}),taxon_photos:(photo:(${PHOTO_FIELDS})))`;
const TAXON_SEARCH_FIELDS = `(id:!t,name:!t,rank:!t,preferred_common_name:!t,default_photo:(${PHOTO_FIELDS}))`;

interface InatPhoto {
  id: number;
  license_code: string | null;
  attribution: string | null;
  attribution_name: string | null;
  url: string | null;
  square_url: string | null;
  medium_url: string | null;
}

interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  preferred_common_name?: string | null;
  default_photo: InatPhoto | null;
  taxon_photos?: { photo: InatPhoto }[] | null;
}

export interface CachedPhoto {
  taxon_inat_id: number | null;
  name_fr: string | null;
  photo_url: string | null;
  photo_square_url: string | null;
  attribution: string | null;
  attribution_name: string | null;
  license_code: string | null;
  source: 'inaturalist';
  status: 'ok' | 'not_found' | 'no_open_photo';
  resolved_at: string;
}

export type PhotoCache = Record<string, CachedPhoto>;

let lastCall = 0;
async function rateGate(): Promise<void> {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function getJson<T>(url: string): Promise<T> {
  await rateGate();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('iNat rate-limited (429).');
  if (!res.ok) throw new Error(`iNat HTTP ${res.status}`);
  return (await res.json()) as T;
}

function isOpen(p: InatPhoto | null | undefined): boolean {
  if (!p?.license_code) return false;
  return ACCEPTED_LICENSES.has(p.license_code.toLowerCase());
}

function pickOpenPhoto(taxon: InatTaxon): InatPhoto | null {
  if (isOpen(taxon.default_photo)) return taxon.default_photo;
  for (const w of taxon.taxon_photos ?? []) {
    if (isOpen(w.photo)) return w.photo;
  }
  return null;
}

async function searchTaxon(sciName: string): Promise<InatTaxon | null> {
  const url =
    `${BASE}/taxa?q=${encodeURIComponent(sciName)}` +
    `&rank=species&is_active=true&per_page=1&locale=fr` +
    `&fields=${TAXON_SEARCH_FIELDS}`;
  const data = await getJson<{ results: InatTaxon[] }>(url);
  const first = data.results[0];
  return first && first.rank === 'species' ? first : null;
}

async function getTaxonWithPhotos(id: number): Promise<InatTaxon | null> {
  const data = await getJson<{ results: InatTaxon[] }>(
    `${BASE}/taxa/${id}?locale=fr&fields=${TAXON_FULL_FIELDS}`,
  );
  return data.results[0] ?? null;
}

function ageDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function isFresh(entry: CachedPhoto): boolean {
  const ttl = entry.status === 'ok' ? TTL_OK_DAYS : TTL_NEGATIVE_DAYS;
  return ageDays(entry.resolved_at) < ttl;
}

async function isPhoto404(url: string): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal });
    return res.status === 404;
  } catch {
    return false; // blip réseau → on ne touche pas au cache
  } finally {
    clearTimeout(timer);
  }
}

/** Met à jour le cache en place. Retourne l'entrée si 'ok', sinon null. */
export async function resolvePhoto(
  sciName: string,
  cache: PhotoCache,
): Promise<CachedPhoto | null> {
  const cached = cache[sciName];
  if (cached && isFresh(cached)) {
    if (cached.status !== 'ok' || !cached.photo_url) return null;
    if (await isPhoto404(cached.photo_url)) {
      // invalidation, on retombe sur la branche fetch
    } else {
      return cached;
    }
  }

  let taxon: InatTaxon | null;
  try {
    taxon = await searchTaxon(sciName);
  } catch (err) {
    console.warn(`inat: search failed for "${sciName}":`, (err as Error).message);
    return null;
  }

  if (!taxon) {
    cache[sciName] = {
      taxon_inat_id: null,
      name_fr: null,
      photo_url: null,
      photo_square_url: null,
      attribution: null,
      attribution_name: null,
      license_code: null,
      source: 'inaturalist',
      status: 'not_found',
      resolved_at: new Date().toISOString(),
    };
    return null;
  }

  let openPhoto = pickOpenPhoto(taxon);
  let fullTaxon: InatTaxon | null = null;
  if (!openPhoto) {
    try {
      fullTaxon = await getTaxonWithPhotos(taxon.id);
      if (fullTaxon) openPhoto = pickOpenPhoto(fullTaxon);
    } catch (err) {
      console.warn(`inat: taxon_photos fetch failed for "${sciName}":`, (err as Error).message);
    }
  }

  const nameFr = fullTaxon?.preferred_common_name ?? taxon.preferred_common_name ?? null;

  if (!openPhoto || !openPhoto.license_code || !openPhoto.attribution) {
    cache[sciName] = {
      taxon_inat_id: taxon.id,
      name_fr: nameFr,
      photo_url: null,
      photo_square_url: null,
      attribution: null,
      attribution_name: null,
      license_code: taxon.default_photo?.license_code ?? null,
      source: 'inaturalist',
      status: 'no_open_photo',
      resolved_at: new Date().toISOString(),
    };
    return null;
  }

  const entry: CachedPhoto = {
    taxon_inat_id: taxon.id,
    name_fr: nameFr,
    photo_url: openPhoto.medium_url ?? openPhoto.url,
    photo_square_url: openPhoto.square_url,
    attribution: openPhoto.attribution,
    attribution_name: openPhoto.attribution_name,
    license_code: openPhoto.license_code,
    source: 'inaturalist',
    status: 'ok',
    resolved_at: new Date().toISOString(),
  };
  cache[sciName] = entry;
  return entry;
}
