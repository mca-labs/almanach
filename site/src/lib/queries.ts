// Requêtes typées pour le site. Toutes graceful-degradent vers null/[] si la
// BD n'est pas joignable ou vide (utile en dev sans Postgres).

import { getSql } from './db.js';

export interface JournalEntry {
  entry_date: string; // YYYY-MM-DD
  title: string | null;
  summary: string | null;
  body_md: string | null;
  highlights: HighlightsBlob;
  published_at: string | null;
}

export interface HighlightsBlob {
  weather?: unknown;
  bird_of_the_day?: BirdOfTheDay | null;
  sky?: unknown;
  theme_tags?: string[];
  fragment_quote_id?: string | null;
}

export interface BirdOfTheDay {
  taxon_common?: string | null;
  taxon_scientific?: string | null;
  confidence?: number | null;
  observed_at?: string;
  media_url?: string | null;
}

export interface WeatherDaily {
  air_temp_min: number | null;
  air_temp_max: number | null;
  air_temp_avg: number | null;
  wind_gust_max: number | null;
  rain_day_final_mm: number | null;
  solar_rad_avg: number | null;
  lightning_count_total: number | null;
  lightning_avg_distance_km: number | null;
  obs_count: number;
}

export interface BirdDetectionGroup {
  taxon_common: string | null;
  taxon_scientific: string;
  count: number;
  max_confidence: number;
  example_media_url: string | null;
}

export interface SkyEventRow {
  category: string;
  title: string;
  detail: unknown;
  notable: boolean;
  propice_a: string | null;
}

export interface Quote {
  text: string;
  author: string;
  work: string;
  year: number | null;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn('queries: fallback', (err as Error).message);
    return fallback;
  }
}

export async function latestPublished(): Promise<JournalEntry | null> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<JournalEntry[]>`
      select entry_date::text, title, summary, body_md, highlights,
             published_at::text
      from journal_entries
      where status = 'published'
      order by entry_date desc
      limit 1
    `;
    return rows[0] ?? null;
  }, null);
}

export async function entryByDate(date: string): Promise<JournalEntry | null> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<JournalEntry[]>`
      select entry_date::text, title, summary, body_md, highlights,
             published_at::text
      from journal_entries
      where entry_date = ${date}::date and status = 'published'
    `;
    return rows[0] ?? null;
  }, null);
}

export async function publishedDates(): Promise<string[]> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<{ entry_date: string }[]>`
      select entry_date::text
      from journal_entries
      where status = 'published'
      order by entry_date desc
    `;
    return rows.map((r) => r.entry_date);
  }, []);
}

export async function weatherFor(date: string): Promise<WeatherDaily | null> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<WeatherDaily[]>`
      select obs_count, air_temp_min, air_temp_max, air_temp_avg,
             wind_gust_max, rain_day_final_mm, solar_rad_avg,
             lightning_count_total, lightning_avg_distance_km
      from weather_daily
      where local_day = ${date}::date
    `;
    return rows[0] ?? null;
  }, null);
}

export async function topBirdsFor(date: string, limit = 8): Promise<BirdDetectionGroup[]> {
  return safe<BirdDetectionGroup[]>(async () => {
    const sql = getSql();
    const rows = await sql<BirdDetectionGroup[]>`
      with day_obs as (
        select taxon_common, taxon_scientific, confidence, media_url
        from observations
        where source = 'birdweather' and kind = 'bird_audio'
          and taxon_scientific is not null
          and (observed_at at time zone 'America/Toronto')::date = ${date}::date
      )
      select taxon_common,
             taxon_scientific,
             count(*)::int as count,
             max(confidence)::float8 as max_confidence,
             (array_agg(media_url) filter (where media_url is not null))[1] as example_media_url
      from day_obs
      group by taxon_common, taxon_scientific
      order by max(confidence) desc nulls last, count(*) desc
      limit ${limit}
    `;
    return [...rows];
  }, []);
}

export async function skyEventsFor(date: string): Promise<SkyEventRow[]> {
  return safe<SkyEventRow[]>(async () => {
    const sql = getSql();
    const rows = await sql<SkyEventRow[]>`
      select category, title, detail, notable, propice_a
      from sky_events
      where for_date = ${date}::date + 1
      order by notable desc, category, title
    `;
    return [...rows];
  }, []);
}

export async function quoteById(id: string): Promise<Quote | null> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<Quote[]>`
      select text, author, work, year
      from ref_quotes
      where id = ${id}::uuid
    `;
    return rows[0] ?? null;
  }, null);
}

export async function totalSpeciesAndDetectionsFor(date: string): Promise<{ species: number; detections: number }> {
  return safe(async () => {
    const sql = getSql();
    const rows = await sql<{ species: number; detections: number }[]>`
      select count(distinct taxon_scientific)::int as species,
             count(*)::int as detections
      from observations
      where source = 'birdweather' and kind = 'bird_audio'
        and (observed_at at time zone 'America/Toronto')::date = ${date}::date
    `;
    return rows[0] ?? { species: 0, detections: 0 };
  }, { species: 0, detections: 0 });
}
