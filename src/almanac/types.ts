// Représentation TS des sky_events (cf. docs/spec.md §5).

export type SkyCategory =
  | 'moon'
  | 'planet'
  | 'twilight'
  | 'iss_pass'
  | 'aurora'
  | 'meteor_shower'
  | 'eclipse';

export type SkySource = 'astronomy-engine' | 'noaa-swpc' | 'celestrak' | 'imo';

export interface SkyEventDraft {
  for_date: string; // YYYY-MM-DD (local)
  category: SkyCategory;
  title: string;
  detail: Record<string, unknown>;
  notable: boolean;
  propice_a: string | null;
  source: SkySource;
}
