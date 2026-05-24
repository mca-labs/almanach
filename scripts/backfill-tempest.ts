// One-shot : remonte l'historique Tempest depuis 2021-09 jusqu'à aujourd'hui.
// Idempotent grâce à unique (source, source_id) — peut être relancé sans risque.
// Usage : npm run -- tsx scripts/backfill-tempest.ts [--from YYYY-MM-DD]

import { sql } from '../src/db/client.js';
import { fetchObsRange, getOutdoorDeviceId } from '../src/ingest/tempest/client.js';
import { parseObsArray } from '../src/ingest/tempest/columns.js';
import { persist } from '../src/ingest/tempest/index.js';
import type { RawObservation } from '../src/ingest/types.js';

const DEFAULT_FROM = '2021-09-01';
const CHUNK_DAYS = 7;
const CHUNK_SECONDS = CHUNK_DAYS * 24 * 60 * 60;

function parseFromArg(): Date {
  const idx = process.argv.indexOf('--from');
  const arg = idx >= 0 ? process.argv[idx + 1] : undefined;
  return new Date(`${arg ?? DEFAULT_FROM}T00:00:00Z`);
}

async function run(): Promise<void> {
  const deviceId = await getOutdoorDeviceId();
  const from = parseFromArg();
  const now = Math.floor(Date.now() / 1000);

  let start = Math.floor(from.getTime() / 1000);
  let totalFetched = 0;
  let totalInserted = 0;

  console.log(`backfill: device=${deviceId} from=${from.toISOString()}`);

  while (start < now) {
    const end = Math.min(start + CHUNK_SECONDS, now);
    const obs = await fetchObsRange(deviceId, start, end);
    const rows: RawObservation[] = [];
    for (const arr of obs) {
      const m = parseObsArray(arr);
      if (m.epoch === null) continue;
      rows.push({
        source: 'tempest',
        source_id: `tempest-${m.epoch}`,
        kind: 'weather',
        observed_at: new Date(m.epoch * 1000).toISOString(),
        measurements: m,
        raw: arr,
      });
    }
    const inserted = await persist(rows);
    totalFetched += rows.length;
    totalInserted += inserted;
    const day = new Date(start * 1000).toISOString().slice(0, 10);
    console.log(
      `  ${day} → +${CHUNK_DAYS}d : fetched=${rows.length} inserted=${inserted}`,
    );
    start = end;
  }

  console.log(`backfill: total fetched=${totalFetched} inserted=${totalInserted}`);
}

(async () => {
  try {
    await run();
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    console.error(err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
})();
