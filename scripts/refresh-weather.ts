/**
 * Régénère un seul fichier data/weather/YYYY-MM-DD.json sans toucher au billet
 * éditorial (data/editions/) ni aux autres jours. Utile après un changement de
 * structure de WeatherDaily (nouveaux champs comme pressure, wind, hourly_lux_avg,
 * last_storm) pour rafraîchir une édition existante sans perdre le texte Claude.
 *
 * Usage : node --import tsx scripts/refresh-weather.ts --date YYYY-MM-DD
 */

import {
  computeHistoricalNorm,
  fetchDailyAggregate,
  type WeatherDaily,
} from '../src/sources/tempest.js';
import { readJson, writeJson } from '../src/util/json.js';

const DATA_DIR = 'data';

function getDateArg(): string {
  const idx = process.argv.indexOf('--date');
  if (idx === -1 || !process.argv[idx + 1]) {
    console.error('Usage: tsx scripts/refresh-weather.ts --date YYYY-MM-DD');
    process.exit(1);
  }
  return process.argv[idx + 1]!;
}

async function findPreviousStorm(
  beforeDate: string,
  maxDaysBack = 365,
): Promise<{ count: number; avg_distance_km: number | null; days_ago: number } | null> {
  const base = new Date(`${beforeDate}T12:00:00Z`);
  for (let d = 1; d <= maxDaysBack; d++) {
    const probe = new Date(base.getTime() - d * 86400000);
    const ds = probe.toISOString().slice(0, 10);
    const w = await readJson<{
      lightning?: { count_total?: number; avg_distance_km?: number | null };
    }>(`${DATA_DIR}/weather/${ds}.json`);
    const count = w?.lightning?.count_total ?? 0;
    if (count > 0) {
      return { count, avg_distance_km: w?.lightning?.avg_distance_km ?? null, days_ago: d };
    }
  }
  return null;
}

async function main(): Promise<void> {
  const date = getDateArg();
  console.log(`Rafraîchissement de data/weather/${date}.json…`);
  const w = await fetchDailyAggregate(date);
  const n = await computeHistoricalNorm(date, `${DATA_DIR}/weather`);
  w.hourly_norm_c = n.hourly_norm_c;
  w.norm_years_used = n.norm_years_used;
  if (w.lightning.count_total > 0) {
    w.lightning.last_storm = {
      count: w.lightning.count_total,
      avg_distance_km: w.lightning.avg_distance_km,
      days_ago: 0,
    };
  } else {
    w.lightning.last_storm = await findPreviousStorm(date, 365);
  }
  await writeJson(`${DATA_DIR}/weather/${date}.json`, w);
  console.log(`✓ ${date} : obs_count=${w.obs_count}, pression=${w.pressure?.mb_now?.toFixed(1) ?? 'n/a'} mb, vent=${w.wind?.direction_compass ?? 'n/a'}, dernier orage=${w.lightning.last_storm ? `il y a ${w.lightning.last_storm.days_ago} j` : 'aucun ≤ 365 j'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
