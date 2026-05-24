// Requêtes GraphQL BirdWeather.
//
// ⚠️ PIÈGE : ne JAMAIS sélectionner `soundscape.mode`. Le schéma le déclare
// non-nullable mais le résolveur retourne fréquemment null, ce qui fait
// échouer toute la réponse. On n'a pas besoin de `mode` (le spec demande
// uniquement url / startTime / endTime).

export const DETECTIONS_QUERY = /* GraphQL */ `
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
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        timestamp
        confidence
        score
        probability
        certainty
        behavior
        species {
          commonName
          scientificName
        }
        soundscape {
          url
          startTime
          endTime
        }
      }
    }
  }
`;

export interface DetectionNode {
  id: string;
  timestamp: string;
  confidence: number | null;
  score: number | null;
  probability: number | null;
  certainty: string | null;
  behavior: string | null;
  species: {
    commonName: string | null;
    scientificName: string | null;
  };
  soundscape: {
    url: string;
    startTime: number;
    endTime: number;
  } | null;
}

export interface DetectionsPage {
  detections: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: DetectionNode[];
  };
}
