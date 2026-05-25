// Backfill Tempest : remonte l'historique daily depuis 2021-09-01 → hier,
// un fichier data/weather/YYYY-MM-DD.json par jour. Idempotent : ignore
// les jours déjà présents sur disque.
//
// Usage : node --env-file=.env --import tsx scripts/backfill-tempest.ts [--from YYYY-MM-DD]

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { fetchDailyAggregate } from '../src/sources/tempest.js';
import { localDate } from '../src/util/date.js';
import { writeJson } from '../src/util/json.js';

const DEFAULT_FROM = '2021-09-01';
const WEATHER_DIR = join(process.cwd(), 'data', 'weather');
const DELAY_MS = 800; // Tempest accumule du rate-limit ; 800 ms tient sur la durée.

function nextDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function run(): Promise<void> {
  const fromIdx = process.argv.indexOf('--from');
  const from = fromIdx >= 0 ? process.argv[fromIdx + 1] : DEFAULT_FROM;
  const yesterday = localDate(new Date(), -1);

  if (!from) {
    throw new Error('Invalid --from arg');
  }

  let cursor = from;
  let done = 0;
  let skipped = 0;
  let failed = 0;
  const start = Date.now();

  while (cursor <= yesterday) {
    const path = join(WEATHER_DIR, `${cursor}.json`);
    if (existsSync(path)) {
      skipped++;
    } else {
      try {
        const w = await fetchDailyAggregate(cursor);
        await writeJson(path, w);
        done++;
        if (done % 50 === 0) {
          const elapsed = ((Date.now() - start) / 1000).toFixed(0);
          console.log(`  ${cursor} → ${done} done, ${skipped} skipped, ${failed} failed (${elapsed}s elapsed)`);
        }
      } catch (err) {
        failed++;
        console.warn(`  ${cursor} → FAILED:`, (err as Error).message);
      }
      // Petite pause anti-spam.
      await new Promise<void>((r) => setTimeout(r, DELAY_MS));
    }
    cursor = nextDate(cursor);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`✓ backfill done: ${done} fetched, ${skipped} skipped, ${failed} failed in ${elapsed}s`);
}

(async () => {
  try {
    await run();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
