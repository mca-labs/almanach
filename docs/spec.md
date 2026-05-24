# Carnet nature — spec consolidé pour Claude Code (v2)

> Document de cadrage pour démarrer le projet. Open source, sur le GitHub personnel de Michael.
> **Avant de coder : présente ton plan et tes réponses aux « Décisions ouvertes » (§13). Demander avant de coder.**

---

## 1. Le projet en une phrase

Un **carnet nature personnel** : un petit observatoire qui agrège des capteurs autour d'une
propriété de Charlevoix, puis publie chaque jour une **« édition du jour » éditoriale** sur un
site web 100 % custom. Projet perso, rendu **open source**.

**Titre : _Almanach du Val des Loups_** — clin d'œil à Aldo Leopold (*A Sand County Almanac*),
aux loups de Saint-Placide, et au surnom des habitants de Baie-Saint-Paul. « Almanach » fixe le
genre éditorial (revue curée, pas tableau de bord). Slug du repo : `almanach`.

**Lieu (ancre publique, préserve la vie privée) :** le pont couvert de Saint-Placide-de-Charlevoix,
sur la rivière du Bras Nord-Ouest. Le carnet s'identifie au pont, pas à l'adresse.
Coordonnées pour tous les calculs : **47.4078, −70.6183, alt. 370 m**, fuseau `America/Toronto`.

---

## 2. La thèse de design (à ne jamais perdre de vue)

**Un éditeur, pas un tableau de bord.** Le rôle de l'IA n'est pas de remplir des panneaux —
c'est de *choisir*, chaque jour, ce qui mérite d'être remarqué et de le mettre en page avec
retenue. On optimise pour la **curation et la clarté**, pas pour la densité.

Primitive centrale : **« faire surface seulement si c'est notable ».** Chaque source ne
contribue à la une que lorsqu'elle franchit un seuil d'intérêt (un oiseau *nouveau*, une aurore
probable, un pic de pluie d'étoiles dans quelques jours). Tout le reste — détections complètes,
courbes, historique — vit derrière un lien discret, sur une **page « données » séparée**.
C'est de la **divulgation progressive** : la une édite, la page données archive.

---

## 3. Deux classes de données (distinction structurante)

1. **`observations`** — relevés *rétrospectifs* : ce qui a été capté/mesuré (météo, détections
   d'oiseaux, images plus tard). C'est observé.
2. **`sky_events`** — almanach *prospectif* : ce qu'il faut aller regarder (éphémérides, ISS,
   aurores, pluies d'étoiles). C'est calculé/prévu, pas observé.

« Ce qui était visible hier soir » = l'almanach appliqué au passé : c'est le pont entre les deux.
La synthèse quotidienne combine ces **deux entrées**.

---

## 4. Stack (infra de Michael)

- **Tout sur Railway** : hébergement, scripts (cron), et **base de données Postgres (Railway
  Postgres)**. Fiabilité « variable » acceptée — projet perso, exploration avant robustesse.
- **Cron Railway** : natif, minimum 5 min, tourne en **UTC** (convertir depuis `America/Toronto`,
  tenir compte de l'heure avancée).
- **Runtime** : Node + TypeScript (cohérent avec l'intention MCP de Michael). Python accepté
  par module si plus simple (ex. l'astro).
- **Synthèse** : API Anthropic (Claude). Vision activée plus tard pour les sources image.
- **Site** : 100 % custom. Proposition : **Astro** lisant Postgres, régénéré/revalidé chaque
  jour. Déploiement Railway (ou Netlify, déjà au compte de Michael).
- **Médias — règle « identifier puis jeter »** : on ne conserve **jamais d'archive de photos**.
  - Oiseaux : **toujours** une image de référence externe (jamais de photo stockée).
  - Caméra de chasse, flore, webcam : chaque image sert uniquement à l'**identification d'espèce**
    (vision Claude), puis est jetée. On ne garde que la **dernière photo** par source (écrasée à
    chaque capture), affichée telle quelle comme « dernière capture ».
  - Les galeries d'espèces (les plus fréquentes, les plus inattendues) n'affichent **jamais** les
    originaux : elles utilisent des **images de référence externes, de sources autorisées et
    licenciées** (Wikimedia Commons, iNaturalist…), comme pour les oiseaux.
  - Conséquence : le besoin de stockage objet est **minime** — une poignée de fichiers « dernière
    photo », pas une archive. (Seul un éventuel timelapse de croissance webcam pourrait justifier
    de conserver une série — à trancher, §13.)
- **Open source** : repo sur le GitHub perso de Michael (qu'il créera ; slug `almanach`).
  Produire `README.md`
  (description, architecture, mention open source, le contexte du projet) et `LICENSE`
  (MIT suggérée, permissive).

---

## 5. Modèle de données (Postgres — proposition)

```sql
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Relevés rétrospectifs : toutes les sources de mesure y écrivent.
create table observations (
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

-- Almanach prospectif : un item de ciel pertinent pour une date.
create table sky_events (
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

-- Le carnet publié : une édition par jour.
create table journal_entries (
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
create table ingest_state (
  source       text primary key,
  last_cursor  text,
  last_run_at  timestamptz,
  notes        text
);

-- Références figées (chargées par seed, versionnées dans le repo, PAS récupérées chaque jour).
create table ref_breeding_calendar (         -- depuis l'Atlas des oiseaux nicheurs (scrap unique)
  code             text primary key,          -- code 4 lettres de l'atlas (ex. PARA, GEBL)
  name_fr          text not null,
  name_scientific  text,
  weeks_ponte      int[],                     -- semaines (1..48) de ponte/incubation
  weeks_elevage    int[]                      -- semaines d'élevage des jeunes
);

create table ref_quotes (                      -- corpus de citations vérifiées
  id            uuid primary key default gen_random_uuid(),
  text          text not null,                 -- texte EXACT, jamais reconstitué de mémoire
  author        text not null,
  work          text not null,
  year          int,
  theme_tags    text[],                        -- ex. {migration, silence, foret, ciel}
  public_domain boolean not null default false
);
```

---

## 6. La une (« édition du jour ») — composition

Une seule page, un scroll, un jour. Sobre, aérée, éditoriale (typo serif pour les moments
éditoriaux, sans-serif pour les données). Sections, dans l'ordre :

1. **En-tête minimal** : titre _Almanach du Val des Loups_, lieu (le pont couvert de
   Saint-Placide), date, une ligne de condition.
2. **Le billet** — **2 paragraphes, point.** Une seule idée. Ton à finaliser (§13).
3. **L'observation du jour** — *une* espèce (la nouvelle ou la plus inattendue), photo de
   référence, heure, confiance.
4. **Le ciel ce soir** — *une ligne* distillée + le « propice à quoi ». ISS / aurores / pluies
   d'étoiles n'apparaissent que si `notable = true`.
5. **La mesure du jour** — courbe de température (année en cours vs moyenne historique depuis
   2021), vent, précipitations du jour, orage/foudre avec « dernier éclair » si < 7 jours,
   et la **jauge de luminosité** (réglette nuit → plein soleil, position déduite du rayonnement
   solaire Tempest).
6. **Activité des oiseaux** — **horloge 24 h** : rayons horaires (détections), arc du jour
   (lever → coucher) en surimpression, minuit en haut, sens horaire. (Maquette validée.)
7. **Le fragment** — citation d'un naturaliste, **choisie** dans `ref_quotes` (jamais récitée de
   mémoire), idéalement assortie au thème du billet, attribuée à l'œuvre. Privilégier le domaine
   public (Thoreau, Muir, Burroughs).
8. **Pied de page** — sources + lien discret « archives & données → ».

### Tiroirs rétractables (divulgation progressive, dans la page)
- **Oiseaux** : top-20 du jour/semaine avec photos + espèces inattendues/rares + lien BirdWeather.
- **Flore** (futur) : **treemap des essences d'arbres** + toggle « autres plantes », chaque
  cellule liée à Wikipédia.

### Page « données » (séparée)
Toute la densité — courbes complètes, historique, carte radar, liste exhaustive des détections.
Disponible, jamais imposée. C'est aussi là que vivent les apprentissages réutilisables.

---

## 7. Synthèse du billet (Claude)

- **Entrées** : les `observations` du jour + les `sky_events` du soir/de la semaine.
- **Sortie** : `journal_entries` (`title`, `summary`, `body_md` = 2 paragraphes, `highlights`).
- **Prompt système** : français ; ton à définir (§13) ; **interdiction d'inventer ou d'estimer**
  toute espèce ou mesure absente des données fournies ; sous le seuil de confiance → « à confirmer ».
- Le **fragment** n'est pas généré : Claude sélectionne une entrée de `ref_quotes` par thème.

---

## 8. Règles données (anti-hallucination — non négociables)

1. Jamais inventer ni estimer une mesure ou une espèce. Recopier les valeurs **verbatim** du payload source.
2. Les citations viennent de `ref_quotes` (texte exact vérifié), **jamais** de la mémoire du modèle.
3. Sous le seuil de confiance, marquer « à confirmer » plutôt qu'affirmer.
4. Les données de ciel sont **calculées** (astronomy-engine), pas devinées.
5. Toute donnée quantitative externe est copiée telle quelle, jamais recalculée.

---

## 9. Modules d'ingestion — v1

Contrat commun :

```ts
interface RawObservation {
  source: string; source_id?: string; kind: string; observed_at: string; // ISO 8601
  taxon_common?: string; taxon_scientific?: string; confidence?: number;
  measurements?: Record<string, unknown>; media_url?: string; lat?: number; lon?: number; raw: unknown;
}
interface SourceModule { name: string; ingest(since: Date): Promise<RawObservation[]>; }
```

### 9.1 `tempest`
- Auth : Personal Access Token (Tempest → Settings → Data Authorizations). En env var.
- API REST (doc officielle `https://weatherflow.github.io/Tempest/api/`). Station `41129`.
- Produit : observations `kind='weather'` (valeurs verbatim) + un **rollup quotidien**
  (min/max température, précipitation totale, vent, **foudre** : « dernier éclair » si < 7 j —
  le Tempest a un capteur de foudre), et le **rayonnement solaire** pour la jauge de luminosité.
- **Comparatif historique** : année en cours vs moyenne « même date » depuis **2021**, calculée à
  partir de l'**historique de la station Tempest `41129`** — données continues depuis 2021, donc
  pas d'Open-Meteo pour la normale. ~5 ans = repère, pas une normale climatique — assumé.
- **Trous de données** : la station peut présenter un « trou » (panne) une journée donnée, une
  année donnée. Dans ce cas, calculer la moyenne « même date » à partir des **autres années
  disponibles** pour ce jour — jamais d'interpolation ni de valeur inventée. Si une seule année
  est disponible pour la date, c'est un repère et non une moyenne : l'afficher comme tel (ou
  l'omettre) plutôt que de prétendre à une normale. Consigner le nombre d'années réellement
  utilisées (auditabilité).

### 9.2 `birdweather`
- API GraphQL : POST `https://app.birdweather.com/graphql` (doc `…/api/index.html`,
  playground `…/graphiql`). Station `6670`.
- Récupère les détections de la fenêtre : nom commun, scientifique, confiance, timestamp,
  `soundscape`, photo de référence. `kind='bird_audio'`.
- **Audio (vérifié)** : chaque `Detection` porte un `soundscape { url, startTime, endTime, mode }`
  (`url` = fichier média `media.birdweather.com/soundscapes/…`). La une expose un bouton
  « Écouter » sur l'observation du jour, câblé à cette `url` ; `startTime`/`endTime` bornent le
  chant dans l'extrait (caler la lecture sur `startTime`). À confirmer en graphiql : si l'accès au
  média exige le jeton de station (le site public les diffuse en clair — bon signe, non garanti).
  Stocker l'URL, jamais le fichier audio (média externe, cohérent avec « identifier puis jeter »).
- **Enrichissement** : statut de nidification via `ref_breeding_calendar` (l'oiseau est-il en
  ponte/élevage à cette date ?). Passerelle de noms requise (code/nom FR atlas ↔ nom scientifique).
- **Rareté** : première de la saison, ou faible fréquence historique à la station. (Baseline
  d'occurrence régionale plus fine via eBird — module futur.)

### 9.3 `almanac` (astro — `sky_events`)
- **Déterministe (local, par coordonnées)** : `astronomy-engine` → lever/coucher/crépuscules
  (civil −6, nautique −12, astro −18), phase et lever/coucher de Lune, visibilité des planètes
  (alt/az, magnitude), conjonctions, éclipses. Pas de clé, pas de quota.
- **Couches en ligne (seulement si notable)** :
  - ISS / satellites : données TLE (Celestrak ou N2YO), passages filtrés par la position.
  - Aurores : NOAA SWPC (indice Kp / prévision aurorale) — pertinent à 47,4 °N.
  - Pluies d'étoiles : table annuelle figée (calendrier IMO), pas de feed temps réel.
- **« Propice à quoi »** : traduire l'état du ciel en activité — pleine lune → marche sans
  frontale + observation lunaire ; nouvelle lune / quartier fin + ciel dégagé → étoiles et ciel
  profond ; le tout tempéré par la couverture nuageuse (Open-Meteo).
- **Masque d'horizon local** (amélioration, §13) : une table altitude-par-azimut pour ne pas
  annoncer un astre masqué par le relief ou la lisière (Charlevoix oblige).

---

## 10. Orchestrateur quotidien

- Cron Railway, 1×/jour (heure à fixer §13 — tension : « le ciel ce soir » veut une génération
  en journée, « l'activité du jour » veut une génération tardive).
- Étapes, chacune invocable seule en CLI (`ingest`, `almanac`, `synthesize --date`, `publish --date`) :
  1. Ingestion des sources (Tempest, BirdWeather) en parallèle → `observations`.
  2. Calcul de l'almanach du soir/semaine → `sky_events` (avec `notable` et `propice_a`).
  3. Génération du billet (Claude) + sélection du fragment → `journal_entries`.
  4. Publication → régénération/revalidation du site.

---

## 11. Sources futures (stubs — ne pas implémenter en v1)

Créer les dossiers/interfaces pour qu'elles s'ajoutent proprement.

- **`spypoint`** (caméra) — **conteneur Railway dédié**. API non officielle (`pyspypoint` /
  `spypoint-api`). Chaque photo → vision Claude pour l'espèce → `observation` (`kind='wildlife_image'`)
  **sans conserver l'original**, sauf la **dernière photo** (affichée comme « la dernière capture »).
  Galeries d'espèces (fréquentes / inattendues) avec images de référence externes, comme les oiseaux.
- **`phone_flora`** — dossier synchronisé ; **géoloc via EXIF GPS** ; chaque photo → ID de
  l'essence/espèce (vision Claude ; option Pl@ntNet à confirmer) → `observation` (`kind='flora_image'`)
  **sans archivage**, sauf la **dernière photo** affichée. Les plus fréquentes alimentent le
  **treemap** (images de référence externes), avec toggle « autres plantes ».
- **`ebird`** — connecteur API eBird (route Merlin : Sound ID n'a pas d'export, la voie est de
  soumettre des listes eBird). Sert aux « sorties actives » + à la **base de fréquence régionale**
  (rareté). Distinct du PUC passif.
- **`webcam`** (jardin/serre) — Raspberry Pi + caméra + cron, une photo/jour à heure fixe ;
  affiche la **dernière**. C'est la **seule** source où conserver une série (timelapse de
  croissance) peut se justifier — à trancher (§13). Éviter une caméra IP « cloud ».
- **`bat`** — BattyBirdNET-Pi (RasPi + micro ultrason) ; pousse `birds.db` + enregistrements vers
  stockage (rclone) ; lit les nouvelles détections → `kind='bat_audio'`. Licence CC BY-NC-SA :
  OK projet perso, **non réutilisable commercialement** (ne pas porter dans un produit).

---

## 12. Configuration (`.env.example`)

```
DATABASE_URL=                  # Railway Postgres
WEATHERFLOW_TOKEN=
WEATHERFLOW_STATION_ID=41129
BIRDWEATHER_STATION_ID=6670
BIRDWEATHER_TOKEN=             # si la lecture l'exige (à confirmer en graphiql)
ANTHROPIC_API_KEY=
OPENMETEO_BASE=                # couverture nuageuse seulement, pas la normale (pas de clé)
NOAA_SWPC_BASE=                # aurores
SITE_DEPLOY_HOOK_URL=          # si rebuild par webhook
OBS_LAT=47.4078
OBS_LON=-70.6183
OBS_ELEV_M=370
TZ=America/Toronto
```

---

## 13. Décisions ouvertes — à confirmer avant de coder

1. **Heure du run quotidien** (et donc l'UTC), vu la tension « ciel ce soir » vs « activité du jour ».
2. **Ton et voix du billet** (Michael : « on verra pour la suite » — à proposer).
3. **Framework du site** : Astro (proposé) ? Cible de déploiement (Railway / Netlify) ?
4. **BirdWeather** : la lecture de la station 6670 exige-t-elle un token ? Quelle requête GraphQL
   donne le mieux des détections horodatées sur une fenêtre ? (tester en graphiql)
5. **Images de référence des galeries** : confirmer les sources autorisées et le respect des
   licences/attribution (Wikimedia Commons, iNaturalist…). Le stockage propre est résolu —
   « dernière photo » seulement, sauf le timelapse webcam à trancher.
6. **Masque d'horizon local** (amélioration almanach) : on l'inclut dès v1 ou plus tard ?
7. **Seed initial** : liste de citations vérifiées (`ref_quotes`) et scrap unique du calendrier
   de nidification (`ref_breeding_calendar`).

---

## 14. Livrables v1

- Repo structuré + `README.md` (description, archi, mention open source) + `LICENSE` (MIT suggérée) + `.env.example`.
- Migrations SQL (tables §5).
- Modules `tempest`, `birdweather`, `almanac` fonctionnels (données réelles).
- Orchestrateur produisant **au moins une « édition du jour »** complète à partir de vraies données.
- La une (composition §6), l'horloge d'activité, la jauge de luminosité, les tiroirs oiseaux.
- Page « données » minimale.
- Stubs/interfaces pour les sources futures (§11), non implémentés.

**Rappel : présente d'abord ton plan et tes réponses au §13. Demander avant de coder.**
