// Construit le contexte structuré envoyé à Claude pour la synthèse du jour.
// Tout est tiré de la BD ; aucune valeur n'est dérivée par TypeScript autre
// que les agrégations strictement définies (§9.1 et §9.3 du spec).

import { sql } from '../db/client.js';

// Seuil de la « règle des trous » §9.1 : un jour < 80% des obs/minute (1152/1440)
// n'est pas compté pour la moyenne « même date ».
const HOLES_MIN_OBS = 1152;

export interface BirdDetectionRow {
  taxon_common: string | null;
  taxon_scientific: string | null;
  confidence: number | null;
  observed_at: string;
  media_url: string | null;
}

export interface DailyContext {
  date: string;
  weather: WeatherSection | null;
  birds: BirdsSection;
  sky: SkySection;
  quotes_available: QuoteOption[];
}

interface WeatherSection {
  obs_count: number;
  air_temperature: {
    min_c: number | null;
    max_c: number | null;
    avg_c: number | null;
    historical: {
      years_used: number;
      avg_of_yearly_avg_c: number | null;
    };
  };
  wind: { gust_max_ms: number | null; avg_avg_ms: number | null };
  rain: { day_final_mm: number | null };
  lightning: { count_total: number; avg_distance_km: number | null };
  solar: { avg_wm2: number | null };
}

interface BirdsSection {
  total_detections: number;
  unique_species: number;
  top_species: { taxon_common: string | null; taxon_scientific: string; count: number; max_confidence: number }[];
  bird_of_the_day: BirdDetectionRow | null;
}

interface SkySection {
  notable_events: { category: string; title: string; detail: unknown; propice_a: string | null }[];
  all_events: { category: string; title: string }[];
}

interface QuoteOption {
  id: string;
  text: string;
  author: string;
  work: string;
  theme_tags: string[];
}

export async function buildContext(forDate: string): Promise<DailyContext> {
  const weather = await loadWeather(forDate);
  const birds = await loadBirds(forDate);
  const sky = await loadSky(forDate);
  const quotes_available = await loadQuotes();
  return { date: forDate, weather, birds, sky, quotes_available };
}

async function loadWeather(forDate: string): Promise<WeatherSection | null> {
  const rows = await sql<{ [k: string]: string | number | null }[]>`
    select obs_count, air_temp_min, air_temp_max, air_temp_avg,
           wind_gust_max, wind_avg_avg, rain_day_final_mm,
           lightning_count_total, lightning_avg_distance_km, solar_rad_avg
    from weather_daily
    where local_day = ${forDate}::date
  `;
  const row = rows[0];
  if (!row) return null;

  const md = forDate.slice(5); // 'MM-DD'
  const hist = await sql<{ avg_of_avg: number | null; years_used: number }[]>`
    select avg(air_temp_avg)::float8 as avg_of_avg, count(*)::int as years_used
    from weather_daily_history
    where md = ${md}
      and year < extract(year from ${forDate}::date)::int
      and obs_count >= ${HOLES_MIN_OBS}
  `;
  const histRow = hist[0]!;

  return {
    obs_count: Number(row['obs_count']),
    air_temperature: {
      min_c: num(row['air_temp_min']),
      max_c: num(row['air_temp_max']),
      avg_c: num(row['air_temp_avg']),
      historical: {
        years_used: histRow.years_used,
        avg_of_yearly_avg_c: histRow.avg_of_avg,
      },
    },
    wind: { gust_max_ms: num(row['wind_gust_max']), avg_avg_ms: num(row['wind_avg_avg']) },
    rain: { day_final_mm: num(row['rain_day_final_mm']) },
    lightning: {
      count_total: Number(row['lightning_count_total'] ?? 0),
      avg_distance_km: num(row['lightning_avg_distance_km']),
    },
    solar: { avg_wm2: num(row['solar_rad_avg']) },
  };
}

async function loadBirds(forDate: string): Promise<BirdsSection> {
  const all = await sql<{ taxon_common: string | null; taxon_scientific: string | null; confidence: number | null; observed_at: string; media_url: string | null }[]>`
    select taxon_common, taxon_scientific, confidence, observed_at::text, media_url
    from observations
    where source = 'birdweather' and kind = 'bird_audio'
      and (observed_at at time zone 'America/Toronto')::date = ${forDate}::date
    order by confidence desc nulls last, observed_at desc
  `;

  const grouped = new Map<string, { taxon_common: string | null; taxon_scientific: string; count: number; max_confidence: number }>();
  for (const d of all) {
    if (!d.taxon_scientific) continue;
    const cur = grouped.get(d.taxon_scientific);
    if (cur) {
      cur.count++;
      if ((d.confidence ?? 0) > cur.max_confidence) cur.max_confidence = d.confidence ?? 0;
    } else {
      grouped.set(d.taxon_scientific, {
        taxon_common: d.taxon_common,
        taxon_scientific: d.taxon_scientific,
        count: 1,
        max_confidence: d.confidence ?? 0,
      });
    }
  }
  const top = [...grouped.values()].sort((a, b) => b.max_confidence - a.max_confidence).slice(0, 10);

  // « Oiseau du jour » : espèce non vue dans les 14 jours précédents à la station,
  // ayant le maximum de confiance aujourd'hui. Fallback : top global.
  const recentSeen = await sql<{ taxon_scientific: string }[]>`
    select distinct taxon_scientific
    from observations
    where source = 'birdweather' and kind = 'bird_audio'
      and taxon_scientific is not null
      and (observed_at at time zone 'America/Toronto')::date between (${forDate}::date - 14) and (${forDate}::date - 1)
  `;
  const recentSet = new Set(recentSeen.map((r) => r.taxon_scientific));
  const newToday = all.find((d) => d.taxon_scientific && !recentSet.has(d.taxon_scientific));
  const fallback = all[0] ?? null;
  const bird_of_the_day = newToday ?? fallback;

  return {
    total_detections: all.length,
    unique_species: grouped.size,
    top_species: top,
    bird_of_the_day,
  };
}

async function loadSky(forDate: string): Promise<SkySection> {
  // « Le ciel ce soir » — perspective du lecteur du matin : on regarde la nuit
  // qui SUIT la date du billet (entry_date + 1 jour). L'observation rétrospective
  // de la veille reste portée par la section météo / oiseaux.
  const rows = await sql<{ category: string; title: string; detail: unknown; notable: boolean; propice_a: string | null }[]>`
    select category, title, detail, notable, propice_a
    from sky_events
    where for_date = ${forDate}::date + 1
    order by notable desc, category, title
  `;
  return {
    notable_events: rows
      .filter((r) => r.notable)
      .map((r) => ({ category: r.category, title: r.title, detail: r.detail, propice_a: r.propice_a })),
    all_events: rows.map((r) => ({ category: r.category, title: r.title })),
  };
}

async function loadQuotes(): Promise<QuoteOption[]> {
  return await sql<QuoteOption[]>`
    select id::text as id, text, author, work, coalesce(theme_tags, '{}'::text[]) as theme_tags
    from ref_quotes
  `;
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}
