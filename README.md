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

## Déploiement

Railway pour tout : Postgres, cron, build du site. Variables d'env reprises de
`.env.example`.

## Licence

MIT — voir [`LICENSE`](LICENSE).
