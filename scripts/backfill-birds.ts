// Backfill BirdWeather : remplit les jours manquants dans data/birds/ pour
// alimenter le graphique « Observations & espèces sur 30 jours » de l'accueil.
// Idempotent : ignore les jours déjà présents sur disque.
//
// Par défaut : fenêtre de --days jours (30) se terminant hier (heure locale).
// Usage :
//   node --env-file=.env --import tsx scripts/backfill-birds.ts
//   node --env-file=.env --import tsx scripts/backfill-birds.ts --from 2026-04-28 --to 2026-05-19
//   node --env-file=.env --import tsx scripts/backfill-birds.ts --days 30

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { fetchDayDetections } from '../src/sources/birdweather.js';
import { localDate } from '../src/util/date.js';
import { writeJson } from '../src/util/json.js';

const BIRDS_DIR = join(process.cwd(), 'data', 'birds');
const DELAY_MS = 600; // pause anti-spam entre deux jours (chaque jour pagine déjà en interne)

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function shiftDate(yyyyMmDd: string, deltaDays: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function run(): Promise<void> {
  const to = argValue('--to') ?? localDate(new Date(), -1); // hier par défaut
  const days = Number(argValue('--days') ?? 30);
  const from = argValue('--from') ?? shiftDate(to, -(days - 1));

  console.log(`Backfill data/birds : ${from} → ${to}`);

  let cursor = from;
  let done = 0;
  let skipped = 0;
  let failed = 0;
  const start = Date.now();

  while (cursor <= to) {
    const path = join(BIRDS_DIR, `${cursor}.json`);
    if (existsSync(path)) {
      skipped++;
    } else {
      try {
        const b = await fetchDayDetections(cursor);
        await writeJson(path, b);
        done++;
        console.log(`  ${cursor} → ${b.total_detections} détections, ${b.unique_species} espèces`);
      } catch (err) {
        failed++;
        console.warn(`  ${cursor} → ÉCHEC : ${(err as Error).message}`);
      }
      await new Promise<void>((r) => setTimeout(r, DELAY_MS));
    }
    cursor = shiftDate(cursor, 1);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log(`✓ backfill terminé : ${done} récupérés, ${skipped} déjà présents, ${failed} échoués (${elapsed}s)`);
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
