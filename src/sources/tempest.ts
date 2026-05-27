// Tempest : fetch + agrège la météo d'un jour local en un seul résumé.
// Pas de persistance ligne-par-ligne (on n'a plus de BD). Le caller écrit le JSON.

import { localMidnight } from '../util/date.js';

const BASE = 'https://swd.weatherflow.com/swd/rest';

// Layout du tableau d'obs device — réf API officielle.
// 0: epoch, 1: wind_lull (m/s), 2: wind_avg, 3: wind_gust, 4: wind_dir,
// 5: sample_interval, 6: station_pressure (mb), 7: air_temp (C),
// 8: relative_humidity (%), 9: illuminance (lux), 10: uv,
// 11: solar_radiation (W/m²), 12: rain_accum_minute (mm),
// 13: precip_type, 14: lightning_avg_distance (km),
// 15: lightning_strike_count, 16: battery, 17: report_interval,
// 18: local_day_rain_accum, 19: rain_accum_final,
// 20: local_day_rain_accum_final, 21: precip_analysis_type
type ObsRow = (number | null)[];

export interface WeatherDaily {
  date: string;
  obs_count: number;
  air_temp_min_c: number | null;
  air_temp_max_c: number | null;
  air_temp_avg_c: number | null;
  /** 24 valeurs (0..23 h locale) — moyenne horaire de la température, null si aucune obs. */
  hourly_temps_c: (number | null)[];
  /** 24 valeurs — moyenne historique « même date » sur les années disponibles dans data/weather/.
   *  Calculée par l'orchestrateur, pas par le fetcher. Tableau vide si aucune historique. */
  hourly_norm_c: (number | null)[];
  /** Années réellement utilisées dans la norm (règle des trous §9.1). */
  norm_years_used: number;
  wind_gust_max_ms: number | null;
  wind_avg_avg_ms: number | null;
  /**
   * Vent enrichi : direction moyenne vectorielle pondérée par la vitesse,
   * qualificatif descriptif, heure de la rafale max. Présent à partir du
   * 2026-05-27. Les anciens fichiers data/weather/*.json n'ont que les deux
   * champs ci-dessus ; la page applique un fallback gracieux.
   */
  wind?: {
    avg_kmh: number | null;
    gust_max_kmh: number | null;
    gust_max_hour_local: number | null;
    direction_deg: number | null;
    direction_compass: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO' | null;
    direction_label: string | null;
    qualifier:
      | 'calme plat'
      | 'calme'
      | 'légère brise'
      | 'brise'
      | 'soutenu'
      | 'fort'
      | 'grand vent'
      | null;
  } | null;
  rain_day_final_mm: number | null;
  solar_rad_avg_wm2: number | null;
  /** Pic de luminosité du jour : heure locale (0..23) et valeur en lux (illuminance Tempest). */
  lux_peak: { hour: number; value_lux: number } | null;
  lightning: {
    count_total: number;
    avg_distance_km: number | null;
    /**
     * Dernier orage observé incluant le jour courant si présent. `null` si rien
     * dans les 365 derniers jours d'historique. Calculé par l'orchestrateur
     * (daily.ts), pas par le fetcher.
     */
    last_storm?: {
      count: number;
      avg_distance_km: number | null;
      /** 0 = jour de l'édition (orage le jour même), 1 = veille, etc. */
      days_ago: number;
    } | null;
  };
  /**
   * Pression atmosphérique à la station (non corrigée à l'altitude du niveau de la mer).
   * `now` = dernière mesure disponible du jour ; `trend_3h_mb` = delta hPa entre `now`
   * et la mesure la plus proche de 3 h plus tôt. Catégorie qualitative ajustée pour
   * la station à 377 m (≈ 45 hPa sous le niveau de la mer) : basse < 960, normale
   * 960-975, haute > 975 (mb à la station).
   */
  pressure: {
    mb_now: number | null;
    trend_3h_mb: number | null;
    category: 'basse' | 'normale' | 'haute' | null;
    direction: 'up' | 'down' | 'flat' | null;
  } | null;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set.`);
  return v;
}

let cachedDeviceId: number | null = null;

async function getOutdoorDeviceId(): Promise<number> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  const token = env('WEATHERFLOW_TOKEN');
  const stationId = env('WEATHERFLOW_STATION_ID');
  const res = await fetch(`${BASE}/stations/${stationId}?token=${token}`);
  if (!res.ok) throw new Error(`Tempest HTTP ${res.status}`);
  const data = (await res.json()) as {
    stations: { devices: { device_id: number; device_type: string }[] }[];
  };
  const outdoor = data.stations[0]?.devices.find((d) => d.device_type === 'ST');
  if (!outdoor) throw new Error('No outdoor device on Tempest station.');
  cachedDeviceId = outdoor.device_id;
  return outdoor.device_id;
}

async function fetchObsRange(deviceId: number, start: number, end: number): Promise<ObsRow[]> {
  const token = env('WEATHERFLOW_TOKEN');
  const url = `${BASE}/observations/device/${deviceId}?time_start=${start}&time_end=${end}&token=${token}`;
  // Retry-with-backoff sur 429 (Tempest rate-limit non documenté mais bien réel).
  let attempt = 0;
  let waitMs = 2000;
  while (true) {
    const res = await fetch(url);
    if (res.status === 429) {
      attempt++;
      if (attempt > 6) throw new Error(`Tempest obs HTTP 429 after ${attempt} retries`);
      await new Promise<void>((r) => setTimeout(r, waitMs));
      waitMs = Math.min(waitMs * 2, 60_000);
      continue;
    }
    if (!res.ok) throw new Error(`Tempest obs HTTP ${res.status}`);
    const data = (await res.json()) as { obs: ObsRow[] | null };
    return data.obs ?? [];
  }
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function max(xs: number[]): number | null {
  return xs.length === 0 ? null : Math.max(...xs);
}

function min(xs: number[]): number | null {
  return xs.length === 0 ? null : Math.min(...xs);
}

function nums(rows: ObsRow[], idx: number): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const v = r[idx];
    if (typeof v === 'number') out.push(v);
  }
  return out;
}

/** Renvoie l'heure locale (0..23) d'un epoch UTC selon America/Toronto. */
type WindCompass = NonNullable<NonNullable<WeatherDaily['wind']>['direction_compass']>;
type WindQualifier = NonNullable<NonNullable<WeatherDaily['wind']>['qualifier']>;

function compass8(deg: number): WindCompass {
  const idx = Math.round(deg / 45) % 8;
  return (['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const)[idx]!;
}

function compassLabel(c: WindCompass): string {
  // "de l’" devant voyelle (O, E), "du" devant consonne (N, NE, NO, S, SE, SO).
  // Apostrophe typographique pour cohérence avec le reste du site français.
  return c === 'O' || c === 'E' ? `de l’${c}` : `du ${c}`;
}

function windQualifier(kmh: number): WindQualifier {
  if (kmh < 1) return 'calme plat';
  if (kmh < 6) return 'calme';
  if (kmh < 12) return 'légère brise';
  if (kmh < 20) return 'brise';
  if (kmh < 29) return 'soutenu';
  if (kmh < 39) return 'fort';
  return 'grand vent';
}

function localHour(epochSec: number): number {
  const d = new Date(epochSec * 1000);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    hour: '2-digit',
    hour12: false,
  });
  // formatToParts retourne 'hour' = '00'..'23'
  const part = fmt.formatToParts(d).find((p) => p.type === 'hour')?.value;
  const h = part ? Number(part) : NaN;
  return Number.isFinite(h) ? h % 24 : 0;
}

/** Agrège la météo d'un jour local en un seul résumé. */
export async function fetchDailyAggregate(date: string): Promise<WeatherDaily> {
  const deviceId = await getOutdoorDeviceId();
  const startLocal = localMidnight(date);
  const start = Math.floor(startLocal.getTime() / 1000);
  const end = start + 86400;
  const rows = await fetchObsRange(deviceId, start, end);

  const temps = nums(rows, 7);
  const windGusts = nums(rows, 3);
  const windAvgs = nums(rows, 2);
  const solar = nums(rows, 11);
  const lightningCounts = nums(rows, 15);
  const lightningDistances = nums(rows, 14);

  // Agrégat horaire : 24 buckets (heure locale 0..23) → moyenne température + pic illuminance
  const hourlyTempSums: number[] = new Array<number>(24).fill(0);
  const hourlyTempCounts: number[] = new Array<number>(24).fill(0);
  let luxPeakValue = -1;
  let luxPeakHour = 0;
  for (const r of rows) {
    const epoch = r[0];
    if (typeof epoch !== 'number') continue;
    const h = localHour(epoch);
    const t = r[7];
    if (typeof t === 'number') {
      hourlyTempSums[h]! += t;
      hourlyTempCounts[h]! += 1;
    }
    const lux = r[9]; // illuminance_lux
    if (typeof lux === 'number' && lux > luxPeakValue) {
      luxPeakValue = lux;
      luxPeakHour = h;
    }
  }
  const hourly_temps_c: (number | null)[] = hourlyTempSums.map((sum, i) => {
    const n = hourlyTempCounts[i]!;
    return n > 0 ? sum / n : null;
  });

  // --- Vent enrichi : direction moyenne vectorielle pondérée + qualificatif + heure du pic ---
  let wind: WeatherDaily['wind'] = null;
  const windRows = rows.filter(
    (r) =>
      typeof r[0] === 'number' &&
      typeof r[2] === 'number' &&
      typeof r[3] === 'number' &&
      typeof r[4] === 'number',
  );
  if (windRows.length > 0) {
    const avgMs =
      windRows.reduce((s, r) => s + (r[2] as number), 0) / windRows.length;
    const avgKmh = avgMs * 3.6;
    let gustMaxMs = -Infinity;
    let gustMaxEpoch = 0;
    for (const r of windRows) {
      const g = r[3] as number;
      if (g > gustMaxMs) {
        gustMaxMs = g;
        gustMaxEpoch = r[0] as number;
      }
    }
    const gustMaxKmh = gustMaxMs > 0 ? gustMaxMs * 3.6 : null;
    const gustMaxHourLocal = gustMaxKmh !== null ? localHour(gustMaxEpoch) : null;
    // Moyenne vectorielle : chaque vecteur (vitesse, direction) somme en composantes E-O / N-S.
    // Convention météo : wind_dir = direction d'où vient le vent, depuis le N, sens horaire.
    let vxSum = 0;
    let vySum = 0;
    for (const r of windRows) {
      const v = r[2] as number;
      const dirRad = ((r[4] as number) * Math.PI) / 180;
      vxSum += v * Math.sin(dirRad);
      vySum += v * Math.cos(dirRad);
    }
    let directionDeg: number | null = null;
    let directionCompass: WindCompass | null = null;
    let directionLabel: string | null = null;
    if (avgKmh >= 1) {
      directionDeg = ((Math.atan2(vxSum, vySum) * 180) / Math.PI + 360) % 360;
      directionCompass = compass8(directionDeg);
      directionLabel = compassLabel(directionCompass);
    }
    wind = {
      avg_kmh: avgKmh,
      gust_max_kmh: gustMaxKmh,
      gust_max_hour_local: gustMaxHourLocal,
      direction_deg: directionDeg,
      direction_compass: directionCompass,
      direction_label: directionLabel,
      qualifier: windQualifier(avgKmh),
    };
  }

  // --- Pression : valeur la plus récente du jour + tendance sur 3 h ---
  const pressureRows = rows
    .filter((r) => typeof r[0] === 'number' && typeof r[6] === 'number')
    .sort((a, b) => (a[0] as number) - (b[0] as number));
  let pressure: WeatherDaily['pressure'] = null;
  if (pressureRows.length > 0) {
    const last = pressureRows[pressureRows.length - 1]!;
    const lastEpoch = last[0] as number;
    const lastMb = last[6] as number;
    const target = lastEpoch - 3 * 3600;
    // Tolérance ±30 min pour trouver la mesure de référence 3 h plus tôt
    const ref = pressureRows
      .filter((r) => Math.abs((r[0] as number) - target) <= 1800)
      .sort(
        (a, b) =>
          Math.abs((a[0] as number) - target) - Math.abs((b[0] as number) - target),
      )[0];
    const trend = ref ? lastMb - (ref[6] as number) : null;
    const cat: 'basse' | 'normale' | 'haute' =
      lastMb < 960 ? 'basse' : lastMb > 975 ? 'haute' : 'normale';
    const dir: 'up' | 'down' | 'flat' | null =
      trend === null ? null : trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'flat';
    pressure = { mb_now: lastMb, trend_3h_mb: trend, category: cat, direction: dir };
  }

  return {
    date,
    obs_count: rows.length,
    air_temp_min_c: min(temps),
    air_temp_max_c: max(temps),
    air_temp_avg_c: avg(temps),
    hourly_temps_c,
    hourly_norm_c: [],
    norm_years_used: 0,
    wind_gust_max_ms: max(windGusts),
    wind_avg_avg_ms: avg(windAvgs),
    rain_day_final_mm: max(nums(rows, 20)),
    solar_rad_avg_wm2: avg(solar),
    lux_peak: luxPeakValue > 0 ? { hour: luxPeakHour, value_lux: luxPeakValue } : null,
    lightning: {
      count_total: lightningCounts.reduce((a, b) => a + b, 0),
      avg_distance_km: lightningDistances.length > 0 ? avg(lightningDistances) : null,
    },
    pressure,
    wind,
  };
}

/**
 * Calcule la moyenne horaire « même date » à partir des fichiers
 * data/weather/YYYY-MM-DD.json déjà sur disque. Exclut l'année cible.
 * Règle des trous §9.1 : un jour avec < 80% des obs minute (1152/1440)
 * est exclu de la moyenne.
 */
export async function computeHistoricalNorm(
  date: string,
  weatherDir: string,
): Promise<{ hourly_norm_c: (number | null)[]; norm_years_used: number }> {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const HOLES_MIN_OBS = 1152;

  const md = date.slice(5); // MM-DD
  const yearTarget = date.slice(0, 4);
  let files: string[];
  try {
    files = await readdir(weatherDir);
  } catch {
    return { hourly_norm_c: [], norm_years_used: 0 };
  }
  const candidates = files.filter(
    (f) => f.endsWith('.json') && f.endsWith(`${md}.json`) && !f.startsWith(yearTarget),
  );

  const sumByHour: number[] = new Array<number>(24).fill(0);
  const countByHour: number[] = new Array<number>(24).fill(0);
  let yearsUsed = 0;
  for (const f of candidates) {
    try {
      const raw = await readFile(join(weatherDir, f), 'utf8');
      const w = JSON.parse(raw) as Partial<WeatherDaily>;
      if ((w.obs_count ?? 0) < HOLES_MIN_OBS) continue;
      const ht = w.hourly_temps_c;
      if (!Array.isArray(ht) || ht.length !== 24) continue;
      for (let h = 0; h < 24; h++) {
        const v = ht[h];
        if (typeof v === 'number') {
          sumByHour[h]! += v;
          countByHour[h]! += 1;
        }
      }
      yearsUsed++;
    } catch {
      // file unreadable, skip
    }
  }
  const hourly_norm_c: (number | null)[] = sumByHour.map((s, i) =>
    countByHour[i]! > 0 ? s / countByHour[i]! : null,
  );
  return { hourly_norm_c, norm_years_used: yearsUsed };
}
