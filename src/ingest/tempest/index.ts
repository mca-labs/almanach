import { sql } from '../../db/client.js';
import type { RawObservation, SourceModule } from '../types.js';
import { fetchObsRange, getOutdoorDeviceId } from './client.js';
import { parseObsArray, TEMPEST_COLUMNS } from './columns.js';

const SOURCE_NAME = 'tempest';
const MAX_WINDOW_SECONDS = 7 * 24 * 60 * 60; // Tempest API limit

function toRaw(arr: (number | null)[]): RawObservation {
  const m = parseObsArray(arr);
  const epoch = m.epoch;
  if (epoch === null) {
    throw new Error('Tempest obs without epoch — refusing to ingest.');
  }
  return {
    source: SOURCE_NAME,
    source_id: `tempest-${epoch}`,
    kind: 'weather',
    observed_at: new Date(epoch * 1000).toISOString(),
    measurements: m,
    raw: arr, // verbatim
  };
}

export async function persist(rows: RawObservation[]): Promise<number> {
  if (rows.length === 0) return 0;
  // ON CONFLICT DO NOTHING for idempotence (unique source+source_id).
  const result = await sql`
    insert into observations
      (source, source_id, kind, observed_at, measurements, raw)
    select
      x.source, x.source_id, x.kind, x.observed_at::timestamptz,
      x.measurements::jsonb, x.raw::jsonb
    from json_to_recordset(${JSON.stringify(rows)}::json) as x(
      source text, source_id text, kind text,
      observed_at text, measurements json, raw json
    )
    on conflict (source, source_id) do nothing
    returning id
  `;
  return result.length;
}

async function lastCursor(): Promise<number | null> {
  const rows = await sql<{ last_cursor: string | null }[]>`
    select last_cursor from ingest_state where source = ${SOURCE_NAME}
  `;
  const cur = rows[0]?.last_cursor;
  return cur ? Number(cur) : null;
}

async function setCursor(epoch: number): Promise<void> {
  await sql`
    insert into ingest_state (source, last_cursor, last_run_at)
    values (${SOURCE_NAME}, ${String(epoch)}, now())
    on conflict (source) do update
      set last_cursor = excluded.last_cursor,
          last_run_at = excluded.last_run_at
  `;
}

export async function ingest(since: Date): Promise<RawObservation[]> {
  const deviceId = await getOutdoorDeviceId();
  const cursor = (await lastCursor()) ?? Math.floor(since.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);

  const all: RawObservation[] = [];
  let start = cursor;
  while (start < now) {
    const end = Math.min(start + MAX_WINDOW_SECONDS, now);
    const obs = await fetchObsRange(deviceId, start, end);
    for (const arr of obs) {
      try {
        all.push(toRaw(arr));
      } catch (err) {
        // Skip malformed rows but log; never invent data.
        console.warn('tempest: skipped obs', err);
      }
    }
    start = end;
  }

  const inserted = await persist(all);
  if (all.length > 0) {
    const lastEpoch = all[all.length - 1]!.measurements!['epoch'] as number;
    await setCursor(lastEpoch);
  }
  console.log(`tempest: fetched=${all.length} inserted=${inserted}`);
  return all;
}

export const tempestModule: SourceModule = {
  name: SOURCE_NAME,
  ingest,
};

// Re-exports for the historical SQL view and backfill script.
export { TEMPEST_COLUMNS };
