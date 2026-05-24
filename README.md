# Almanach du Val des Loups

Un petit observatoire nature de notre maison près du pont couvert de
Saint-Placide-de-Charlevoix, sur la rivière du Bras Nord-Ouest — qui agrège
des capteurs autour de la propriété et publie chaque nuit une **édition figée**
décrivant la veille.

C'est un almanach avec une direction éditoriale axée sur la lisibilité, la clarté et la simplicité et non un tableau de bord : chaque jour, on choisit *une* chose à
signaler, on la met en page avec retenue, et on laisse la densité vivre derrière un lien discret.

Projet personnel, open source (MIT).

## Architecture

- **Runtime** : Node + TypeScript.
- **BD** : Postgres (Railway en prod).
- **Site** : Astro, lecture de Postgres, régénération nocturne.
- **Synthèse** : API Anthropic (Claude). La voix est dans
  [`prompts/editorial-voice.md`](prompts/editorial-voice.md), modifiable à chaud.
- **Cron** : Railway natif, `1 5 * * *` UTC (= 00:01 EST / 01:01 EDT) — toujours
  post-minuit local, l'édition décrit la veille.

```
src/
├── ingest/          # tempest, birdweather + stubs des sources futures
├── almanac/         # éphémérides (astronomy-engine), aurores, ISS, météores
├── synthesize/      # appel Claude + sélection du fragment dans ref_quotes
└── orchestrator/    # le runner quotidien

site/                # Astro — une / archives / a-propos / donnees
migrations/          # SQL versionné, sans ORM
scripts/             # seeds (ref_quotes, ref_breeding_calendar)
docs/                # spec.md (source de vérité), handoff.md, mockups/
prompts/             # editorial-voice.md (asset runtime)
```

## Sources

- **Tempest** station `41129` — météo, foudre, rayonnement solaire ; historique
  continu depuis septembre 2021 (~4,7 ans, repère et non normale climatique).
- **BirdWeather** station `6670` — détections d'oiseaux + soundscapes FLAC
  publics ; API GraphQL accessible sans jeton.
- **astronomy-engine** (local) — éphémérides, phase lunaire, planètes.
- **NOAA SWPC** — aurores (Kp).
- **Open-Meteo** — couverture nuageuse uniquement.

## Règles non négociables

1. **Verbatim de la source ou rien.** Aucune mesure ou espèce inventée.
2. **Citations** : uniquement depuis `ref_quotes`, jamais reconstituées de
   mémoire.
3. **Sous le seuil de confiance** : marquer « à confirmer », jamais affirmer.
4. **Ciel** : calculé, jamais deviné.

Voir [`docs/spec.md`](docs/spec.md) pour le détail.

## Démarrage

```bash
cp .env.example .env       # renseigner WEATHERFLOW_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL
npm install
npm run migrate            # crée le schéma
npm run seed:quotes        # seed initial des citations
npm run daily              # ingest + almanac + synthesize + publish
```

Pendant le dev, le site Astro :

```bash
npm run site:dev
```

## Déploiement Railway

Le service de génération nocturne est configuré par
[`railway.json`](railway.json) (config-as-code) : builder Nixpacks,
`startCommand = "npm run migrate && npm run daily"`,
`cronSchedule = "1 5 * * *"`, retry × 1 sur échec. Le site Astro
(quand il sera ajouté) vivra dans un second service avec son propre
`site/railway.json`.

### Cron et changement d'heure

Le cron Railway s'évalue en **UTC fixe**. `1 5 * * *` UTC correspond à :

- **00 h 01 EST** (hiver, UTC−5) — heure cible
- **01 h 01 EDT** (été, UTC−4) — un peu plus tard, toujours **après
  minuit local**

Le code n'assume rien de l'offset : à chaque tick, `src/orchestrator/daily.ts`
recalcule la date locale `America/Toronto` et choisit `entryDate = veille`
et `skyDate = ce soir`. La même config marche donc toute l'année, et un
décalage occasionnel de quelques minutes lors d'une transition DST ne
change rien à la sémantique.

### Mise en route Railway (one-time, manuel)

`railway.json` ne couvre que les sections build + deploy d'un service.
Le reste se fait au dashboard, une fois par projet :

1. **Créer le projet** sur Railway et le lier au repo GitHub
   `mca-labs/almanach` (branche `main`).
2. **Ajouter Postgres** (« + New » → Database → PostgreSQL, ou `railway add`).
3. **Brancher `DATABASE_URL`** sur le service de génération via une
   *reference variable* (`${{Postgres.DATABASE_URL}}`).
4. **Saisir les secrets et variables** dans Settings → Variables (jamais
   dans `railway.json`) : `WEATHERFLOW_TOKEN`, `ANTHROPIC_API_KEY`,
   `SITE_DEPLOY_HOOK_URL` (optionnel), plus les non-secrets si on veut
   surcharger les valeurs de [`.env.example`](.env.example).
5. **Vérifier le cron** dans Settings → Cron Schedule : confirmer que
   `1 5 * * *` est bien actif.
6. **Bootstrap** : Lancer une première génération manuelle depuis le
   dashboard (« Deploy ») ou en CLI Railway (`railway run npm run daily`)
   pour amorcer la BD. Le backfill historique Tempest se lance à part :
   `railway run npm run backfill:tempest` (≈ 5-10 min, idempotent).

### ⚠️ Bug connu — cron en config-as-code (déc. 2025)

Un bug a été observé où le `cronSchedule` défini dans `railway.json`
restait bloqué et ne déclenchait pas. **Si la génération nocturne ne
tourne pas après une journée**, contournement : régler le schedule
directement dans Settings → Cron Schedule du dashboard, et garder ça
jusqu'à confirmation que le bug est corrigé.

### Pourquoi la sortie propre du process est critique

Le job tourne en mode cron : Railway lance `startCommand`, attend qu'il
sorte, puis ferme tout. Si le process ne sort pas (handle ouvert, socket
en keepalive, promesse non awaited), Railway considère le run encore en
cours et **saute la run suivante silencieusement**. Tous les entrypoints
(`src/cli.ts`, `src/db/migrate.ts`, `scripts/backfill-tempest.ts`)
ferment explicitement le pool Postgres et appellent `process.exit(0)`.
À conserver lors de tout futur ajout.

## Licence

MIT — voir [`LICENSE`](LICENSE).
