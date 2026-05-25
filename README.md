# Almanach du Val des Loups

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

## Démarrage local

```bash
cp .env.example .env       # renseigner WEATHERFLOW_TOKEN, ANTHROPIC_API_KEY, etc.
npm install
npm run daily              # génère l'édition d'hier dans data/
npm run site:dev           # lance le site Astro sur http://localhost:4321
```

Pour générer une date précise (en local ou via le workflow) :

```bash
npm run daily -- --date 2026-05-20
```

> ⚠️ Sur Node ≥ 24 le script tourne tel quel. Sur Node 20 + `tsx`, l'interop
> ESM↔CJS de `astronomy-engine` casse (`Observer is not a constructor`) — le
> workflow GitHub utilise donc Node 24 explicitement.

> ⚠️ Ne pas utiliser `node --env-file=.env` : tronque silencieusement les
> valeurs longues (clé Anthropic). Utiliser `set -a && source .env && set +a`
> ou laisser le workflow injecter via `env:`.

## Cron et changement d'heure

Le workflow GitHub Actions s'évalue en **UTC fixe**. `5 5 * * *` UTC
correspond à :

- **00 h 05 EST** (hiver, UTC−5)
- **01 h 05 EDT** (été, UTC−4)

— toujours post-minuit local. À chaque tick, `src/daily.ts` recalcule la
date locale `America/Toronto` et choisit `entryDate = veille` et
`skyDate = ce soir`. La même config marche toute l'année.

## Licence

MIT — voir [`LICENSE`](LICENSE).
