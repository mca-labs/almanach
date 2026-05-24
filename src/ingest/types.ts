// Contrat commun des modules d'ingestion.
// Spec : docs/spec.md §9.

export interface RawObservation {
  source: string;
  source_id?: string;
  kind: string;
  observed_at: string; // ISO 8601
  taxon_common?: string;
  taxon_scientific?: string;
  confidence?: number;
  measurements?: Record<string, unknown>;
  media_url?: string;
  lat?: number;
  lon?: number;
  raw: unknown;
}

export interface SourceModule {
  name: string;
  ingest(since: Date): Promise<RawObservation[]>;
}
