// Client iNaturalist API v2 (sparse fieldsets), conforme aux recommandations :
// - User-Agent identifie le projet (URL publique)
// - ~1 req/seconde max (recommandation : 60/min, plafond dur à 100/min)
// - Pas de scraping massif — notre cadence est triviale (cache 30 j Postgres)
//
// ⚠️ v2 exige un paramètre `fields=(...)` explicite : sans ça, la réponse
// ne contient que `{id}`. Le format est inspiré de JSON:API : feuilles
// scalaires marquées `:!t`, sous-objets en parenthèses.
//
// Refs :
//   https://api.inaturalist.org/v2/docs/
//   https://www.inaturalist.org/pages/api+recommended+practices

const BASE = 'https://api.inaturalist.org/v2';
const USER_AGENT = 'almanach-val-des-loups/0.1 (+https://github.com/mca-labs/almanach)';
const MIN_INTERVAL_MS = 1100; // 1 req/s + marge

// Sparse fieldsets v2 — verbatim, fait l'objet d'un test croisé en CI manuel.
const PHOTO_FIELDS =
  'id:!t,license_code:!t,attribution:!t,attribution_name:!t,' +
  'url:!t,square_url:!t,medium_url:!t';
const TAXA_SEARCH_FIELDS = `(id:!t,name:!t,rank:!t,default_photo:(${PHOTO_FIELDS}))`;
const TAXON_FULL_FIELDS = `(id:!t,name:!t,rank:!t,default_photo:(${PHOTO_FIELDS}),taxon_photos:(photo:(${PHOTO_FIELDS})))`;

let lastCallAt = 0;
async function rateGate(): Promise<void> {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }
  lastCallAt = Date.now();
}

export interface InatPhoto {
  id: number;
  license_code: string | null; // 'cc0' | 'cc-by' | 'cc-by-nc' | 'pd' | null | autre
  attribution: string | null;
  attribution_name: string | null;
  url: string | null;        // square_url, 75 px
  square_url: string | null; // 75 px
  medium_url: string | null; // ≈ 500 px — c'est celui qu'on affiche
}

export interface InatTaxonPhotoWrapper {
  photo: InatPhoto;
}

export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  default_photo: InatPhoto | null;
  taxon_photos?: InatTaxonPhotoWrapper[] | null;
  matched_term?: string;
}

interface InatTaxaResponse {
  total_results: number;
  results: InatTaxon[];
}

async function getJson<T>(url: string): Promise<T> {
  await rateGate();
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 429) {
    throw new Error('iNat rate-limited (429) — try again later or check policy.');
  }
  if (!res.ok) {
    throw new Error(`iNat HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function searchTaxonByScientificName(sciName: string): Promise<InatTaxon | null> {
  const url =
    `${BASE}/taxa?q=${encodeURIComponent(sciName)}` +
    `&rank=species&is_active=true&per_page=1` +
    `&fields=${TAXA_SEARCH_FIELDS}`;
  const data = await getJson<InatTaxaResponse>(url);
  const first = data.results[0];
  if (!first) return null;
  // Garde-fou : on n'accepte que des matches "espèce", pas plus haut.
  if (first.rank !== 'species') return null;
  return first;
}

/** Récupère un taxon par id avec sa galerie complète (taxon_photos),
 *  utilisé pour le fallback quand default_photo n'est pas open-licensed. */
export async function getTaxonByIdWithPhotos(id: number): Promise<InatTaxon | null> {
  const url = `${BASE}/taxa/${id}?fields=${TAXON_FULL_FIELDS}`;
  const data = await getJson<InatTaxaResponse>(url);
  return data.results[0] ?? null;
}
