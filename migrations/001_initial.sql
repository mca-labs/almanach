-- Migration initiale : modèle de données de l'Almanach du Val des Loups.
-- Source de vérité : docs/spec.md §5.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Relevés rétrospectifs : toutes les sources de mesure y écrivent.
create table if not exists observations (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,            -- 'tempest' | 'birdweather' | 'spypoint' | 'phone_flora' | 'ebird' | 'webcam' | 'bat'
  source_id         text,                     -- clé naturelle (dédup)
  kind              text not null,            -- 'weather' | 'bird_audio' | 'wildlife_image' | 'flora_image' | 'bat_audio'
  observed_at       timestamptz not null,
  taxon_common      text,
  taxon_scientific  text,
  confidence        numeric,                  -- 0..1 si fourni
  measurements      jsonb,                    -- valeurs structurées, recopiées VERBATIM
  media_url         text,
  lat               double precision,
  lon               double precision,
  raw               jsonb not null,           -- payload brut (ne jamais perdre l'original)
  ingested_at       timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists observations_source_observed_at_idx
  on observations (source, observed_at desc);
create index if not exists observations_observed_at_idx
  on observations (observed_at desc);
create index if not exists observations_taxon_scientific_idx
  on observations (taxon_scientific) where taxon_scientific is not null;

-- Almanach prospectif : un item de ciel pertinent pour une date.
create table if not exists sky_events (
  id           uuid primary key default gen_random_uuid(),
  for_date     date not null,
  category     text not null,                 -- 'moon' | 'planet' | 'twilight' | 'iss_pass' | 'aurora' | 'meteor_shower' | 'eclipse'
  title        text not null,
  detail       jsonb,                         -- heures, magnitudes, Kp, azimut/altitude, etc.
  notable      boolean not null default false,-- pilote l'affichage sur la une
  propice_a    text,                          -- ex. 'marche sans frontale + observation lunaire'
  source       text not null,                 -- 'astronomy-engine' | 'noaa-swpc' | 'celestrak' | 'imo'
  computed_at  timestamptz not null default now()
);

create index if not exists sky_events_for_date_idx on sky_events (for_date);
create index if not exists sky_events_notable_idx on sky_events (for_date) where notable;

-- Le carnet publié : une édition par jour.
create table if not exists journal_entries (
  id            uuid primary key default gen_random_uuid(),
  entry_date    date not null unique,
  title         text,
  summary       text,
  body_md       text,                         -- LE BILLET : 2 paragraphes maximum
  highlights    jsonb,                        -- faits saillants structurés
  status        text not null default 'draft',-- 'draft' | 'published'
  generated_at  timestamptz,
  published_at  timestamptz
);

-- Curseur d'ingestion par source.
create table if not exists ingest_state (
  source       text primary key,
  last_cursor  text,
  last_run_at  timestamptz,
  notes        text
);

-- Références figées (chargées par seed, versionnées dans le repo).
create table if not exists ref_breeding_calendar (
  code             text primary key,          -- code 4 lettres de l'atlas (ex. PARA, GEBL)
  name_fr          text not null,
  name_scientific  text,
  weeks_ponte      int[],                     -- semaines (1..48) de ponte/incubation
  weeks_elevage    int[]                      -- semaines d'élevage des jeunes
);

create table if not exists ref_quotes (
  id            uuid primary key default gen_random_uuid(),
  text          text not null,                 -- texte EXACT, jamais reconstitué de mémoire
  author        text not null,
  work          text not null,
  year          int,
  theme_tags    text[],                        -- ex. {migration, silence, foret, ciel}
  public_domain boolean not null default false
);

create index if not exists ref_quotes_theme_tags_idx on ref_quotes using gin (theme_tags);
