// BirdWeather : fetch les détections d'un jour local + agrège en top espèces.
// API GraphQL publique (validé sans jeton). Piège : NE PAS sélectionner
// `Soundscape.mode` — déclaré non-nullable mais résolveur renvoie null,
// casse toute la réponse.

const ENDPOINT = 'https://app.birdweather.com/graphql';
const LOCAL_TZ = 'America/Toronto';
const PAGE_SIZE = 200;
const SAFETY_PAGE_CAP = 50;

interface DetectionNode {
  id: string;
  timestamp: string;
  confidence: number | null;
  species: { commonName: string | null; scientificName: string | null };
  soundscape: { url: string; startTime: number; endTime: number } | null;
}

interface DetectionsPage {
  detections: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: DetectionNode[];
  };
}

export interface SpeciesGroup {
  taxon_common: string | null;
  taxon_scientific: string;
  count: number;
  max_confidence: number;
  example_media_url: string | null;
}

export interface BirdDetectionRow {
  taxon_common: string | null;
  taxon_scientific: string | null;
  confidence: number | null;
  observed_at: string;
  media_url: string | null;
}

export interface BirdsDaily {
  date: string;
  total_detections: number;
  unique_species: number;
  top_species: SpeciesGroup[];
  bird_of_the_day: BirdDetectionRow | null;
  /** 24 valeurs (0..23 h locale) — nombre de détections par heure. */
  hourly_detections: number[];
}

const QUERY = /* GraphQL */ `
  query DetectionsForStation(
    $period: InputDuration!
    $stationIds: [ID!]!
    $first: Int!
    $after: String
  ) {
    detections(
      period: $period
      stationIds: $stationIds
      first: $first
      after: $after
      sortBy: "timestamp"
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        timestamp
        confidence
        species { commonName scientificName }
        soundscape { url startTime endTime }
      }
    }
  }
`;

async function gql(variables: Record<string, unknown>): Promise<DetectionsPage> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  if (!res.ok) throw new Error(`BirdWeather HTTP ${res.status}`);
  const body = (await res.json()) as { data?: DetectionsPage; errors?: unknown[] };
  if (body.errors) throw new Error(`BirdWeather GraphQL: ${JSON.stringify(body.errors)}`);
  if (!body.data) throw new Error('BirdWeather: empty response.');
  return body.data;
}

export async function fetchDayDetections(date: string): Promise<BirdsDaily> {
  const stationId = process.env.BIRDWEATHER_STATION_ID;
  if (!stationId) throw new Error('BIRDWEATHER_STATION_ID is not set.');

  const all: DetectionNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < SAFETY_PAGE_CAP; page++) {
    const variables: Record<string, unknown> = {
      period: { from: date, to: date, timezone: LOCAL_TZ },
      stationIds: [stationId],
      first: PAGE_SIZE,
    };
    if (after !== null) variables['after'] = after;
    const data = await gql(variables);
    all.push(...data.detections.nodes);
    if (!data.detections.pageInfo.hasNextPage) break;
    after = data.detections.pageInfo.endCursor;
    if (after === null) break;
  }

  return aggregate(date, all);
}

function localHourFromIso(iso: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    hour: '2-digit',
    hour12: false,
  });
  const part = fmt.formatToParts(new Date(iso)).find((p) => p.type === 'hour')?.value;
  const h = part ? Number(part) : NaN;
  return Number.isFinite(h) ? h % 24 : 0;
}

function aggregate(date: string, nodes: DetectionNode[]): BirdsDaily {
  const grouped = new Map<string, SpeciesGroup>();
  const hourly: number[] = new Array<number>(24).fill(0);
  for (const n of nodes) {
    if (!n.species.scientificName) continue;
    const key = n.species.scientificName;
    hourly[localHourFromIso(n.timestamp)]! += 1;
    const cur = grouped.get(key);
    if (cur) {
      cur.count++;
      if ((n.confidence ?? 0) > cur.max_confidence) {
        cur.max_confidence = n.confidence ?? 0;
        if (n.soundscape) cur.example_media_url = n.soundscape.url;
      }
    } else {
      grouped.set(key, {
        taxon_common: n.species.commonName,
        taxon_scientific: key,
        count: 1,
        max_confidence: n.confidence ?? 0,
        example_media_url: n.soundscape?.url ?? null,
      });
    }
  }
  // Tri par fréquence (count desc) — c'est l'ordre qu'affiche le site.
  const top = [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  // « Oiseau du jour » : la plus haute confiance du jour.
  const best = nodes.reduce<DetectionNode | null>((acc, n) => {
    if (!n.species.scientificName) return acc;
    if (!acc) return n;
    return (n.confidence ?? 0) > (acc.confidence ?? 0) ? n : acc;
  }, null);

  const bird_of_the_day: BirdDetectionRow | null = best
    ? {
        taxon_common: best.species.commonName,
        taxon_scientific: best.species.scientificName,
        confidence: best.confidence,
        observed_at: best.timestamp,
        media_url: best.soundscape?.url ?? null,
      }
    : null;

  return {
    date,
    total_detections: nodes.length,
    unique_species: grouped.size,
    top_species: top,
    bird_of_the_day,
    hourly_detections: hourly,
  };
}
