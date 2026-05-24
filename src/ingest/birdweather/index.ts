import { sql } from '../../db/client.js';
import type { RawObservation, SourceModule } from '../types.js';
import { gql, stationId } from './client.js';
import { DETECTIONS_QUERY, type DetectionNode, type DetectionsPage } from './queries.js';

const SOURCE_NAME = 'birdweather';
const TZ = 'America/Toronto';
const PAGE_SIZE = 200;

function isoDate(d: Date): string {
  // BirdWeather InputDuration.from/to expects ISO8601Date (YYYY-MM-DD).
  // On exprime en heure locale du fuseau de la station.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d); // en-CA produit déjà YYYY-MM-DD
}

function toRaw(node: DetectionNode): RawObservation {
  const obs: RawObservation = {
    source: SOURCE_NAME,
    source_id: `bw-${node.id}`,
    kind: 'bird_audio',
    observed_at: node.timestamp,
    measurements: {
      confidence: node.confidence,
      score: node.score,
      probability: node.probability,
      certainty: node.certainty,
      behavior: node.behavior,
      soundscape_start: node.soundscape?.startTime ?? null,
      soundscape_end: node.soundscape?.endTime ?? null,
    },
    raw: node,
  };
  if (node.species.commonName) obs.taxon_common = node.species.commonName;
  if (node.species.scientificName) obs.taxon_scientific = node.species.scientificName;
  if (node.confidence !== null) obs.confidence = node.confidence;
  if (node.soundscape) obs.media_url = node.soundscape.url;
  return obs;
}

export async function persist(rows: RawObservation[]): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await sql`
    insert into observations
      (source, source_id, kind, observed_at,
       taxon_common, taxon_scientific, confidence, measurements, media_url, raw)
    select
      x.source, x.source_id, x.kind, x.observed_at::timestamptz,
      x.taxon_common, x.taxon_scientific, x.confidence::numeric,
      x.measurements::jsonb, x.media_url, x.raw::jsonb
    from json_to_recordset(${JSON.stringify(rows)}::json) as x(
      source text, source_id text, kind text, observed_at text,
      taxon_common text, taxon_scientific text, confidence text,
      measurements json, media_url text, raw json
    )
    on conflict (source, source_id) do nothing
    returning id
  `;
  return result.length;
}

export async function ingest(since: Date): Promise<RawObservation[]> {
  const from = isoDate(since);
  const to = isoDate(new Date());
  const all: RawObservation[] = [];

  let after: string | null = null;
  let pages = 0;
  while (true) {
    const variables: Record<string, unknown> = {
      period: { from, to, timezone: TZ },
      stationIds: [stationId()],
      first: PAGE_SIZE,
    };
    if (after !== null) variables['after'] = after;
    const data = await gql<DetectionsPage, typeof variables>(DETECTIONS_QUERY, variables);
    for (const node of data.detections.nodes) {
      all.push(toRaw(node));
    }
    pages++;
    if (!data.detections.pageInfo.hasNextPage) break;
    after = data.detections.pageInfo.endCursor;
    if (after === null) break;
    if (pages > 200) {
      console.warn('birdweather: hit safety pagination cap (200 pages).');
      break;
    }
  }

  const inserted = await persist(all);
  console.log(`birdweather: fetched=${all.length} inserted=${inserted} pages=${pages}`);
  return all;
}

export const birdweatherModule: SourceModule = {
  name: SOURCE_NAME,
  ingest,
};
