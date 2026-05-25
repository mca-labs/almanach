# Almanach du Val-des-Loups

*[English version below](#english-version)*

Un petit observatoire nature de notre maison près du pont couvert de
Saint-Placide-de-Charlevoix, sur la rivière du Bras Nord-Ouest — qui agrège
des capteurs autour de la propriété et publie chaque nuit une **édition figée**
décrivant la veille.

En ligne : <https://valdesloups.com>

C'est un almanach avec une direction éditoriale axée sur la lisibilité, la
clarté et la simplicité, et non un tableau de bord : chaque jour, on choisit
*une* chose à signaler, on la met en page avec retenue, et on laisse la
densité vivre derrière un lien discret.

Projet personnel, open source (MIT).

## Architecture

Le repo GitHub **est** l'état persistant — pas de base de données. Chaque nuit,
un workflow GitHub Actions exécute le script de génération, écrit le JSON du
jour dans `data/`, commit et push. Netlify détecte le push et rebuild le site
statique. Toute la chaîne est versionnée et inspectable dans `git log`.

```
GitHub Actions cron (5 5 * * * UTC, ≈ 01:05 EDT)
        ↓ npm run daily (tsx src/cli.ts)
        ↓ écrit data/{weather,birds,sky,editions}/YYYY-MM-DD.json
        ↓ + data/inat-photos.json (cache iNat)
        ↓ git commit + git push
GitHub push main → Netlify rebuild auto (Astro static)
        ↓ npm run site:build → publish site/dist
Netlify CDN sert valdesloups.com (HTTPS Let's Encrypt)
```

- **Runtime du cron** : Node 24 + TypeScript (via `tsx`).
- **Site** : Astro `output: 'static'`, lecture directe des JSON sous `data/`
  au moment du build.
- **Synthèse** : API Anthropic (Claude). La voix est dans
  [`prompts/editorial-voice.md`](prompts/editorial-voice.md), modifiable à chaud.
- **Hosting** : Netlify (site statique).
- **DNS** : Namecheap (apex `valdesloups.com`, www en redirect vers apex).

## Structure du code

```
src/
├── cli.ts                # entrypoint : node --import tsx src/cli.ts [--date YYYY-MM-DD]
├── daily.ts              # orchestrateur 5 étapes
├── almanac.ts            # astronomy-engine + NOAA + IMO + Open-Meteo
├── synthesize.ts         # appel Claude, charge editorial-voice.md
├── sources/
│   ├── tempest.ts        # météo (agrégat journalier, horaire, norm historique)
│   ├── birdweather.ts    # détections d'oiseaux (GraphQL)
│   └── inat.ts           # photos d'espèces (cache TTL)
└── util/{date,json}.ts

scripts/
└── backfill-tempest.ts   # one-shot remontée historique Tempest

site/
├── astro.config.mjs
└── src/
    ├── lib/data.ts                       # lit les JSON, queries typées au build
    ├── layouts/Base.astro
    ├── components/TopBar.astro
    ├── pages/{index,a-propos,credits,donnees}.astro
    ├── pages/archives/index.astro        # page unique listant tous les billets
    └── styles/globals.css

data/                     # le repo EST l'état
├── weather/YYYY-MM-DD.json    # Tempest, backfill depuis 2021-09-01
├── birds/YYYY-MM-DD.json      # BirdWeather
├── sky/YYYY-MM-DD.json        # éphémérides (astro + atmo)
├── editions/YYYY-MM-DD.json   # billet éditorial de Claude
├── inat-photos.json           # cache iNaturalist
├── quotes.json                # 13 citations statiques (Thoreau, Muir, etc.)
└── breeding.json              # 246 espèces Atlas QC

prompts/editorial-voice.md     # voix de Claude (asset runtime)
.github/workflows/daily.yml    # cron quotidien
netlify.toml                   # build statique
```

## Sources

- **Tempest** station `41129` — météo, foudre, rayonnement solaire ;
  historique continu depuis septembre 2021 (~4,7 ans, repère et non normale
  climatique).
- **BirdWeather** station `6670` — détections d'oiseaux + soundscapes FLAC
  publics ; API GraphQL accessible sans jeton.
- **iNaturalist** API v2 — photos d'espèces (cc-by / cc-by-nc / pd) avec nom
  français, cache TTL.
- **astronomy-engine** (lib npm, local) — éphémérides, phase lunaire,
  planètes.
- **NOAA SWPC** — aurores (Kp).
- **IMO** — pluies d'étoiles (calendrier statique).
- **Open-Meteo** — couverture nuageuse uniquement (pas de clé).

## Règles non négociables

1. **Verbatim de la source ou rien.** Aucune mesure ou espèce inventée.
2. **Citations** : uniquement depuis `data/quotes.json`, jamais reconstituées
   de mémoire.
3. **Sous le seuil de confiance** : marquer « à confirmer », jamais affirmer.
4. **Ciel** : calculé, jamais deviné.

## Cron et changement d'heure

Le workflow GitHub Actions s'évalue en **UTC fixe**. `5 5 * * *` UTC
correspond à :

- **00 h 05 EST** (hiver, UTC−5)
- **01 h 05 EDT** (été, UTC−4)

— toujours post-minuit local. À chaque tick, `src/daily.ts` recalcule la
date locale `America/Toronto` et choisit `entryDate = veille` et
`skyDate = ce soir`. La même config marche toute l'année.

## Suivi du projet

Deux fichiers à la racine documentent l'évolution :

- [`BACKLOG.md`](BACKLOG.md) — ce qui est en cours, à venir, reporté. Source de vérité pour la roadmap.
- [`CHANGELOG.md`](CHANGELOG.md) — ce qui a été mis en ligne, par date.

Quand un item du backlog est déployé, il sort du backlog et entre dans le changelog à la date courante.

## Licence

MIT — voir [`LICENSE`](LICENSE).

---

<a id="english-version"></a>

# Almanach du Val-des-Loups — English version

A small nature observatory based at our home near the covered bridge of
Saint-Placide-de-Charlevoix, on the Bras Nord-Ouest river — aggregating
sensors around the property and publishing every night a **frozen daily
edition** describing the day before.

Live at: <https://valdesloups.com>

This is an almanac with an editorial direction grounded in readability,
clarity and restraint — not a dashboard. Each day, *one* thing is chosen
to highlight, laid out with restraint, and density is left to live behind
discreet links.

Personal project, open source (MIT).

## Architecture

The GitHub repo **is** the persistent state — no database. Every night, a
GitHub Actions workflow runs the generation script, writes the day's JSON
to `data/`, commits and pushes. Netlify detects the push and rebuilds the
static site. The whole chain is versioned and inspectable through `git log`.

```
GitHub Actions cron (5 5 * * * UTC, ≈ 01:05 EDT)
        ↓ npm run daily (tsx src/cli.ts)
        ↓ writes data/{weather,birds,sky,editions}/YYYY-MM-DD.json
        ↓ + data/inat-photos.json (iNat cache)
        ↓ git commit + git push
GitHub push main → Netlify auto-rebuild (Astro static)
        ↓ npm run site:build → publish site/dist
Netlify CDN serves valdesloups.com (HTTPS Let's Encrypt)
```

- **Cron runtime**: Node 24 + TypeScript (via `tsx`).
- **Site**: Astro `output: 'static'`, reads JSON files under `data/` directly
  at build time.
- **Synthesis**: Anthropic (Claude) API. The voice lives in
  [`prompts/editorial-voice.md`](prompts/editorial-voice.md), hot-editable.
- **Hosting**: Netlify (static site).
- **DNS**: Namecheap (apex `valdesloups.com`, www redirects to apex).

## Code structure

```
src/
├── cli.ts                # entrypoint: node --import tsx src/cli.ts [--date YYYY-MM-DD]
├── daily.ts              # 5-step orchestrator
├── almanac.ts            # astronomy-engine + NOAA + IMO + Open-Meteo
├── synthesize.ts         # Claude call, loads editorial-voice.md
├── sources/
│   ├── tempest.ts        # weather (daily aggregate, hourly, historical norm)
│   ├── birdweather.ts    # bird detections (GraphQL)
│   └── inat.ts           # species photos (TTL cache)
└── util/{date,json}.ts

scripts/
└── backfill-tempest.ts   # one-shot Tempest historical backfill

site/
├── astro.config.mjs
└── src/
    ├── lib/data.ts                       # reads JSON, typed queries at build
    ├── layouts/Base.astro
    ├── components/TopBar.astro
    ├── pages/{index,a-propos,credits,donnees}.astro
    ├── pages/archives/index.astro        # single page listing all posts
    └── styles/globals.css

data/                     # the repo IS the state
├── weather/YYYY-MM-DD.json    # Tempest, backfilled since 2021-09-01
├── birds/YYYY-MM-DD.json      # BirdWeather
├── sky/YYYY-MM-DD.json        # ephemerides (astro + atmo)
├── editions/YYYY-MM-DD.json   # Claude's editorial post
├── inat-photos.json           # iNaturalist cache
├── quotes.json                # 13 static quotations (Thoreau, Muir, etc.)
└── breeding.json              # 246 species QC Atlas

prompts/editorial-voice.md     # Claude's voice (runtime asset)
.github/workflows/daily.yml    # daily cron
netlify.toml                   # static build
```

## Sources

- **Tempest** station `41129` — weather, lightning, solar radiation;
  continuous record since September 2021 (~4.7 years, used as a local
  reference and not a climate normal).
- **BirdWeather** station `6670` — bird detections + public FLAC
  soundscapes; GraphQL API, no token required.
- **iNaturalist** API v2 — species photos (cc-by / cc-by-nc / pd) with
  French names, TTL cache.
- **astronomy-engine** (npm lib, local) — ephemerides, lunar phase,
  planets.
- **NOAA SWPC** — auroras (Kp).
- **IMO** — meteor showers (static calendar).
- **Open-Meteo** — cloud cover only (no key).

## Non-negotiable rules

1. **Verbatim from the source, or nothing.** No measurement or species made up.
2. **Quotations**: only from `data/quotes.json`, never reconstructed from
   memory.
3. **Below the confidence threshold**: mark as "à confirmer", never assert.
4. **Sky**: computed, never guessed.

## Cron and daylight saving

The GitHub Actions workflow runs in **fixed UTC**. `5 5 * * *` UTC means:

- **00:05 EST** (winter, UTC−5)
- **01:05 EDT** (summer, UTC−4)

— always past local midnight. On each tick, `src/daily.ts` recomputes the
local date in `America/Toronto` and picks `entryDate = previous day` and
`skyDate = tonight`. Same config works year-round.

## Project tracking

Two files at the root document the evolution:

- [`BACKLOG.md`](BACKLOG.md) — what's in progress, coming up, deferred. Source
  of truth for the roadmap.
- [`CHANGELOG.md`](CHANGELOG.md) — what's been deployed, by date.

When a backlog item is shipped, it leaves the backlog and enters the
changelog at the current date.

## License

MIT — see [`LICENSE`](LICENSE).
