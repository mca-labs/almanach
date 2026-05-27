// Lecture des fichiers JSON committés dans data/ au build time.
// Aucune BD : tout est statique, versionné dans le repo, lu par Astro.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Le site est dans /site, les data dans /data (un cran plus haut).
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', '..', '..', 'data');

// --- Types miroirs des shapes produites par src/daily.ts ---

export interface JournalEntry {
  entry_date: string;
  generated_at: string;
  title: string | null;
  summary: string;
  body_md: string;
  sky_narrative?: string;
  theme_tags: string[];
  highlights: {
    weather?: unknown;
    bird_of_the_day?: BirdOfTheDay | null;
    sky?: unknown;
  };
  fragment_quote_id: string | null;
  fragment_translation_fr?: string | null;
}

export interface BirdOfTheDay {
  taxon_common?: string | null;
  taxon_scientific?: string | null;
  confidence?: number | null;
  observed_at?: string;
  media_url?: string | null;
}

export interface WeatherDaily {
  date: string;
  obs_count: number;
  air_temp_min_c: number | null;
  air_temp_max_c: number | null;
  air_temp_avg_c: number | null;
  hourly_temps_c: (number | null)[];
  hourly_norm_c: (number | null)[];
  norm_years_used: number;
  wind_gust_max_ms: number | null;
  wind_avg_avg_ms: number | null;
  rain_day_final_mm: number | null;
  solar_rad_avg_wm2: number | null;
  lux_peak: { hour: number; value_lux: number } | null;
  lightning: { count_total: number; avg_distance_km: number | null };
  pressure?: {
    mb_now: number | null;
    trend_3h_mb: number | null;
    category: 'basse' | 'normale' | 'haute' | null;
    direction: 'up' | 'down' | 'flat' | null;
  } | null;
}

export interface SpeciesGroup {
  taxon_common: string | null;
  taxon_scientific: string;
  count: number;
  max_confidence: number;
  example_media_url: string | null;
}

export interface BirdsDaily {
  date: string;
  total_detections: number;
  unique_species: number;
  top_species: SpeciesGroup[];
  bird_of_the_day: BirdOfTheDay | null;
  hourly_detections: number[];
}

export interface SkyEvent {
  category: string;
  title: string;
  detail: Record<string, unknown>;
  notable: boolean;
  propice_a: string | null;
}

export interface SkyDaily {
  for_date: string;
  events: SkyEvent[];
  cloud_cover_night_pct: number | null;
}

export interface CachedPhoto {
  taxon_inat_id: number | null;
  name_fr: string | null;
  photo_url: string | null;
  photo_square_url: string | null;
  attribution: string | null;
  attribution_name: string | null;
  license_code: string | null;
  status: 'ok' | 'not_found' | 'no_open_photo';
  resolved_at: string;
}

export type PhotoCache = Record<string, CachedPhoto>;

export interface Quote {
  id: string;
  text: string;
  author: string;
  work: string;
  year: number;
  theme_tags: string[];
  lang: 'fr' | 'en';
}

export interface SpeciesPhotoCredit {
  taxon_scientific: string;
  taxon_common: string | null;
  attribution: string;
  attribution_name: string | null;
  license_code: string;
  photo_url: string;
}

export interface RareSpecies {
  taxon_scientific: string;
  taxon_common: string | null;
  name_fr: string | null;
  photo_url: string | null;
  photo_square_url: string | null;
  attribution: string | null;
  reason: string;
}

// --- Helpers ---

async function readJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function listJsonInDir(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

// --- Public queries ---

export async function publishedDates(): Promise<string[]> {
  const names = await listJsonInDir(join(DATA_DIR, 'editions'));
  return names.sort().reverse();
}

export async function latestPublished(): Promise<JournalEntry | null> {
  const dates = await publishedDates();
  const latest = dates[0];
  if (!latest) return null;
  return readJsonOrNull<JournalEntry>(join(DATA_DIR, 'editions', `${latest}.json`));
}

export async function entryByDate(date: string): Promise<JournalEntry | null> {
  return readJsonOrNull<JournalEntry>(join(DATA_DIR, 'editions', `${date}.json`));
}

export async function weatherFor(date: string): Promise<WeatherDaily | null> {
  return readJsonOrNull<WeatherDaily>(join(DATA_DIR, 'weather', `${date}.json`));
}

export async function birdsFor(date: string): Promise<BirdsDaily | null> {
  return readJsonOrNull<BirdsDaily>(join(DATA_DIR, 'birds', `${date}.json`));
}

export async function skyForEntry(date: string): Promise<SkyDaily | null> {
  // « Ce soir » du lecteur = jour qui suit entry_date.
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const skyDate = next.toISOString().slice(0, 10);
  return readJsonOrNull<SkyDaily>(join(DATA_DIR, 'sky', `${skyDate}.json`));
}

async function loadPhotoCache(): Promise<PhotoCache> {
  return (await readJsonOrNull<PhotoCache>(join(DATA_DIR, 'inat-photos.json'))) ?? {};
}

export async function topBirdsWithPhotos(
  date: string,
  limit = 8,
): Promise<(SpeciesGroup & { name_fr: string | null; photo_url: string | null; photo_square_url: string | null; attribution: string | null; attribution_name: string | null; license_code: string | null })[]> {
  const birds = await birdsFor(date);
  if (!birds) return [];
  const cache = await loadPhotoCache();
  // Tri par nombre de détections décroissant — les plus fréquentes en premier.
  const sorted = [...birds.top_species].sort((a, b) => b.count - a.count);
  return sorted.slice(0, limit).map((b) => {
    const p = cache[b.taxon_scientific];
    const isOk = p?.status === 'ok';
    return {
      ...b,
      name_fr: p?.name_fr ?? null,
      photo_url: isOk ? p.photo_url : null,
      photo_square_url: isOk ? p.photo_square_url : null,
      attribution: isOk ? p.attribution : null,
      attribution_name: isOk ? (p.attribution_name ?? null) : null,
      license_code: isOk ? p.license_code : null,
    };
  });
}

export async function birdOfTheDayWithPhoto(date: string): Promise<
  | (BirdOfTheDay & {
      name_fr: string | null;
      photo_url: string | null;
      attribution: string | null;
      attribution_name: string | null;
      license_code: string | null;
    })
  | null
> {
  const birds = await birdsFor(date);
  const bird = birds?.bird_of_the_day ?? null;
  if (!bird?.taxon_scientific) return null;
  const cache = await loadPhotoCache();
  const p = cache[bird.taxon_scientific];
  const isOk = p?.status === 'ok';
  return {
    ...bird,
    name_fr: p?.name_fr ?? null,
    photo_url: isOk ? p.photo_url : null,
    attribution: isOk ? p.attribution : null,
    attribution_name: isOk ? (p.attribution_name ?? null) : null,
    license_code: isOk ? p.license_code : null,
  };
}

export async function quoteById(id: string): Promise<Quote | null> {
  const data = await readJsonOrNull<{ citations: Quote[] }>(join(DATA_DIR, 'quotes.json'));
  return data?.citations.find((c) => c.id === id) ?? null;
}

/**
 * Espèces « inattendues » du jour. Pour l'instant, on identifie celles
 * jamais détectées dans les fichiers data/birds/*.json antérieurs ("première
 * de la saison"). La détection « rare au secteur » exigerait une baseline
 * régionale (eBird) qu'on n'a pas — donc omise.
 */
export async function rareSpeciesForDate(date: string): Promise<RareSpecies[]> {
  const birds = await birdsFor(date);
  if (!birds) return [];

  const allDates = await listJsonInDir(join(DATA_DIR, 'birds'));
  const pastDates = allDates.filter((d) => d < date);

  const seenBefore = new Set<string>();
  for (const past of pastDates) {
    const file = await readJsonOrNull<BirdsDaily>(join(DATA_DIR, 'birds', `${past}.json`));
    if (!file) continue;
    for (const sp of file.top_species) {
      seenBefore.add(sp.taxon_scientific);
    }
  }

  const cache = await loadPhotoCache();
  const out: RareSpecies[] = [];
  for (const sp of birds.top_species) {
    if (!seenBefore.has(sp.taxon_scientific)) {
      const p = cache[sp.taxon_scientific];
      const isOk = p?.status === 'ok';
      out.push({
        taxon_scientific: sp.taxon_scientific,
        taxon_common: sp.taxon_common,
        name_fr: p?.name_fr ?? null,
        photo_url: isOk ? p.photo_url : null,
        photo_square_url: isOk ? p.photo_square_url : null,
        attribution: isOk ? p.attribution : null,
        reason: 'première de la saison',
      });
    }
  }
  return out.slice(0, 6); // borne raisonnable
}

export async function creditsForDate(date: string): Promise<SpeciesPhotoCredit[]> {
  const birds = await birdsFor(date);
  if (!birds) return [];
  const cache = await loadPhotoCache();
  const out: SpeciesPhotoCredit[] = [];
  for (const s of birds.top_species) {
    const p = cache[s.taxon_scientific];
    if (
      p?.status === 'ok' &&
      p.photo_url &&
      p.attribution &&
      p.license_code
    ) {
      out.push({
        taxon_scientific: s.taxon_scientific,
        taxon_common: s.taxon_common,
        attribution: p.attribution,
        attribution_name: p.attribution_name,
        license_code: p.license_code,
        photo_url: p.photo_url,
      });
    }
  }
  return out;
}
