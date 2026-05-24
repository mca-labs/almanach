// Client iNaturalist API v1, conforme aux recommandations de pratique :
// - User-Agent identifie le projet (URL publique)
// - ~1 req/seconde max (recommandation : 60/min, plafond dur à 100/min)
// - Pas de scraping massif — notre cadence est triviale (cache 30 j Postgres)
//
// Ref : https://www.inaturalist.org/pages/api+recommended+practices

const BASE = 'https://api.inaturalist.org/v1';
const USER_AGENT = 'almanach-val-des-loups/0.1 (+https://github.com/mca-labs/almanach)';
const MIN_INTERVAL_MS = 1100; // 1 req/s + marge

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

export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  default_photo: InatPhoto | null;
  matched_term?: string;
}

interface InatTaxaResponse {
  total_results: number;
  results: InatTaxon[];
}

export async function searchTaxonByScientificName(sciName: string): Promise<InatTaxon | null> {
  await rateGate();
  const url =
    `${BASE}/taxa?q=${encodeURIComponent(sciName)}` +
    `&rank=species&is_active=true&per_page=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 429) {
    throw new Error('iNat rate-limited (429) — try again later or check policy.');
  }
  if (!res.ok) {
    throw new Error(`iNat HTTP ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as InatTaxaResponse;
  const first = data.results[0];
  if (!first) return null;
  // Garde-fou : on n'accepte que des matches "espèce", pas plus haut.
  if (first.rank !== 'species') return null;
  return first;
}
