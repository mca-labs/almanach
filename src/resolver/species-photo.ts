// Résolveur d'image de référence par espèce.
//
// Patron : appel local-first (cache Postgres), fallback iNat (open data),
// retour structuré { photo_url, attribution, license_code, … }. JAMAIS de
// téléchargement du fichier ; on stocke uniquement URL + métadonnées de
// licence — cohérent avec « identifier puis jeter » (§4 du spec).
//
// LICENCES ACCEPTÉES : cc0, cc-by, cc-by-nc, pd. Toute autre valeur (« c »,
// « no-license », autre) → marqué `status='no_open_photo'` et rejeté.
//
// ⚠️ CC-BY-NC interdit l'usage commercial. Le projet est perso/open source,
// donc OK ici — mais NE PAS monétiser sans renégocier les licences photo.

import { sql } from '../db/client.js';
import { searchTaxonByScientificName, type InatPhoto } from './inat-client.js';

const TTL_DAYS = 30;
const ACCEPTED_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-nc', 'pd']);

export interface SpeciesPhoto {
  photo_url: string;
  photo_square_url: string | null;
  attribution: string;
  attribution_name: string | null;
  license_code: string;
  source: 'inaturalist';
}

interface CachedRow {
  taxon_scientific: string;
  taxon_inat_id: number | null;
  photo_url: string | null;
  photo_square_url: string | null;
  attribution: string | null;
  attribution_name: string | null;
  license_code: string | null;
  status: 'ok' | 'no_open_photo' | 'not_found';
  resolved_at: string;
}

function isOpenPhoto(p: InatPhoto | null): boolean {
  if (!p) return false;
  if (!p.license_code) return false;
  return ACCEPTED_LICENSES.has(p.license_code.toLowerCase());
}

function rowToPhoto(row: CachedRow): SpeciesPhoto | null {
  if (row.status !== 'ok') return null;
  if (!row.photo_url || !row.attribution || !row.license_code) return null;
  return {
    photo_url: row.photo_url,
    photo_square_url: row.photo_square_url,
    attribution: row.attribution,
    attribution_name: row.attribution_name,
    license_code: row.license_code,
    source: 'inaturalist',
  };
}

async function getCached(sciName: string): Promise<CachedRow | null> {
  const rows = await sql<CachedRow[]>`
    select taxon_scientific, taxon_inat_id, photo_url, photo_square_url,
           attribution, attribution_name, license_code, status,
           resolved_at::text
    from ref_species_photos
    where taxon_scientific = ${sciName}
      and resolved_at > now() - (${TTL_DAYS} || ' days')::interval
  `;
  return rows[0] ?? null;
}

async function upsert(row: Omit<CachedRow, 'resolved_at'>): Promise<void> {
  await sql`
    insert into ref_species_photos
      (taxon_scientific, taxon_inat_id, photo_url, photo_square_url,
       attribution, attribution_name, license_code, status, source, resolved_at)
    values
      (${row.taxon_scientific}, ${row.taxon_inat_id},
       ${row.photo_url}, ${row.photo_square_url},
       ${row.attribution}, ${row.attribution_name}, ${row.license_code},
       ${row.status}, 'inaturalist', now())
    on conflict (taxon_scientific) do update set
      taxon_inat_id     = excluded.taxon_inat_id,
      photo_url         = excluded.photo_url,
      photo_square_url  = excluded.photo_square_url,
      attribution       = excluded.attribution,
      attribution_name  = excluded.attribution_name,
      license_code      = excluded.license_code,
      status            = excluded.status,
      resolved_at       = excluded.resolved_at
  `;
}

export async function resolveSpeciesPhoto(sciName: string): Promise<SpeciesPhoto | null> {
  // 1. Cache frais ?
  const cached = await getCached(sciName);
  if (cached) return rowToPhoto(cached);

  // 2. Cherche dans iNat
  let taxon;
  try {
    taxon = await searchTaxonByScientificName(sciName);
  } catch (err) {
    console.warn(`species-photo: iNat call failed for "${sciName}"`, err);
    return null; // on ne cache PAS l'échec réseau — réessai au prochain run
  }

  if (!taxon) {
    await upsert({
      taxon_scientific: sciName,
      taxon_inat_id: null,
      photo_url: null,
      photo_square_url: null,
      attribution: null,
      attribution_name: null,
      license_code: null,
      status: 'not_found',
    });
    return null;
  }

  if (!isOpenPhoto(taxon.default_photo)) {
    await upsert({
      taxon_scientific: sciName,
      taxon_inat_id: taxon.id,
      photo_url: null,
      photo_square_url: null,
      attribution: null,
      attribution_name: null,
      license_code: taxon.default_photo?.license_code ?? null,
      status: 'no_open_photo',
    });
    return null;
  }

  // isOpenPhoto a déjà validé : default_photo non-null, license dans la liste.
  // On rebascule en non-null sans cast via une garde explicite.
  const p = taxon.default_photo;
  if (!p) return null; // unreachable, mais nécessaire pour le narrowing TS
  const photoUrl = p.medium_url ?? p.url;
  const license = p.license_code;
  const attribution = p.attribution;
  if (!photoUrl || !license || !attribution) return null;

  await upsert({
    taxon_scientific: sciName,
    taxon_inat_id: taxon.id,
    photo_url: photoUrl,
    photo_square_url: p.square_url,
    attribution,
    attribution_name: p.attribution_name,
    license_code: license,
    status: 'ok',
  });

  return {
    photo_url: photoUrl,
    photo_square_url: p.square_url,
    attribution,
    attribution_name: p.attribution_name,
    license_code: license,
    source: 'inaturalist',
  };
}

export async function resolveMany(sciNames: string[]): Promise<void> {
  // Résolution en série (rate-limited à 1 req/s par le client iNat).
  // Sans-effet si tout est déjà en cache frais.
  const uniq = [...new Set(sciNames)];
  let resolved = 0;
  for (const name of uniq) {
    try {
      const r = await resolveSpeciesPhoto(name);
      if (r) resolved++;
    } catch (err) {
      console.warn(`species-photo: resolve failed for "${name}"`, err);
    }
  }
  console.log(`species-photo: ${resolved}/${uniq.length} resolved`);
}
