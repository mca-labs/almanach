// Tempest device observation array — column layout fixé par l'API REST.
// Réf : https://weatherflow.github.io/Tempest/api/swagger/#/Observations
// Toute modification doit refléter la doc officielle ; on stocke aussi le
// tableau brut dans observations.raw pour conserver le verbatim source.

export const TEMPEST_COLUMNS = [
  'epoch',
  'wind_lull_ms',
  'wind_avg_ms',
  'wind_gust_ms',
  'wind_direction_deg',
  'wind_sample_interval_s',
  'station_pressure_mb',
  'air_temperature_c',
  'relative_humidity_pct',
  'illuminance_lux',
  'uv_index',
  'solar_radiation_wm2',
  'rain_accum_minute_mm',
  'precipitation_type', // 0 none, 1 rain, 2 hail, 3 rain+hail
  'lightning_strike_avg_distance_km',
  'lightning_strike_count',
  'battery_v',
  'report_interval_min',
  'local_day_rain_accum_mm',
  'rain_accum_final_mm',
  'local_day_rain_accum_final_mm',
  'precip_analysis_type',
] as const;

export type TempestColumn = (typeof TEMPEST_COLUMNS)[number];

export type TempestObsArray = (number | null)[];

export type TempestMeasurements = Record<TempestColumn, number | null>;

export function parseObsArray(arr: TempestObsArray): TempestMeasurements {
  const out = {} as TempestMeasurements;
  for (let i = 0; i < TEMPEST_COLUMNS.length; i++) {
    const col = TEMPEST_COLUMNS[i]!;
    out[col] = arr[i] ?? null;
  }
  return out;
}
