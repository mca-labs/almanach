-- Cache des images de référence d'espèces, résolues depuis iNaturalist.
-- Règle « identifier puis jeter » : on ne stocke QUE l'URL + métadonnées de
-- licence, jamais le fichier image. L'image vit chez iNat / S3 open data.
--
-- Statut :
--   'ok'             : photo open-data trouvée, utilisable
--   'no_open_photo'  : taxon trouvé, mais default_photo pas open-licensed
--   'not_found'      : nom scientifique non résolu côté iNat
-- Le site filtre sur status = 'ok' pour afficher la vignette.

create table if not exists ref_species_photos (
  taxon_scientific  text primary key,
  taxon_inat_id     int,
  photo_url         text,            -- medium_url (≈ 500 px), bucket open data
  photo_square_url  text,            -- square_url pour les vignettes
  attribution       text,            -- string complète prête à afficher
  attribution_name  text,            -- juste le photographe / source
  license_code      text,            -- 'cc0' | 'cc-by' | 'cc-by-nc' | 'pd' | null
  source            text not null default 'inaturalist',
  status            text not null default 'ok',
  resolved_at       timestamptz not null default now()
);

create index if not exists ref_species_photos_status_idx
  on ref_species_photos (status, resolved_at);
