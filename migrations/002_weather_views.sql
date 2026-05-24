-- Vues d'agrégation Tempest, en heure locale America/Toronto.
-- La règle des trous (§9.1) reste paramétrable via obs_count.

create or replace view weather_daily as
with local_obs as (
  select
    (observed_at at time zone 'America/Toronto')::date as local_day,
    (measurements->>'air_temperature_c')::numeric as air_temp,
    (measurements->>'wind_gust_ms')::numeric as wind_gust,
    (measurements->>'wind_avg_ms')::numeric as wind_avg,
    (measurements->>'solar_radiation_wm2')::numeric as solar_rad,
    (measurements->>'lightning_strike_count')::int as lightning_count,
    (measurements->>'lightning_strike_avg_distance_km')::numeric as lightning_dist,
    (measurements->>'rain_accum_minute_mm')::numeric as rain_min,
    (measurements->>'local_day_rain_accum_final_mm')::numeric as rain_day_final
  from observations
  where source = 'tempest' and kind = 'weather'
)
select
  local_day,
  count(*) as obs_count,
  min(air_temp)                as air_temp_min,
  max(air_temp)                as air_temp_max,
  avg(air_temp)                as air_temp_avg,
  max(wind_gust)               as wind_gust_max,
  avg(wind_avg)                as wind_avg_avg,
  avg(solar_rad)               as solar_rad_avg,
  sum(rain_min)                as rain_total_minute_mm,
  max(rain_day_final)          as rain_day_final_mm,
  sum(lightning_count)         as lightning_count_total,
  avg(lightning_dist) filter (where lightning_count > 0) as lightning_avg_distance_km
from local_obs
group by local_day;

-- Même chose, indexée par (mois-jour, année) pour la comparaison « même date ».
create or replace view weather_daily_history as
select
  to_char(local_day, 'MM-DD')               as md,
  extract(year from local_day)::int         as year,
  local_day,
  obs_count,
  air_temp_min, air_temp_max, air_temp_avg,
  wind_gust_max, wind_avg_avg, solar_rad_avg,
  rain_total_minute_mm, rain_day_final_mm,
  lightning_count_total
from weather_daily;

comment on view weather_daily_history is
  'Vue historique « même date » pour la comparaison annuelle. Filtrer obs_count >= seuil pour appliquer la règle des trous (§9.1 du spec). Seuil recommandé : 1152 (= 80% de 1440 obs/min/jour).';
