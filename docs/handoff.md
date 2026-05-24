# Démarrage Claude Code — Almanach du Val des Loups (pass 1 : v1 fonctionnel)

Tu démarres le projet **Almanach du Val des Loups** : un observatoire nature
d'un seul lieu, qui publie chaque nuit une édition figée décrivant la veille.
Ce pass produit un **v1 fonctionnel**, pas un design fini — le raffinement
visuel viendra ensuite, via le skill **Impeccable** (`/critique`, `/audit`)
appliqué d'après `.impeccable.md`.

## Lis d'abord, dans cet ordre

1. **`docs/spec.md`** — LE spec. Source de vérité pour
   l'architecture, le schéma SQL, les sources, la synthèse, les règles. En cas
   de doute, le spec tranche.
2. **Les trois maquettes HTML** dans `docs/mockups/` — référence visuelle et
   structurelle **à réutiliser**, pas à réinventer : `une.html`, `archives.html`,
   `a-propos.html`. Elles portent le système de tokens, l'ordre des sections,
   les composants (courbes, jauge, horloge, grille d'oiseaux, bouton Écouter)
   et des commentaires `TODO(data)` qui indiquent exactement quoi câbler.
3. **`prompts/editorial-voice.md`** — chargé par l'étape de synthèse (§7) à chaque
   génération du billet.
4. **`.impeccable.md`** — le contrat de goût. À respecter, sans chercher à
   l'exécuter à fond dès ce pass.

## Consignes du pass

- **Suis le §6** (composition de la une) et **réutilise les maquettes** : porte
  leur CSS (tokens, composants, ordre des sections) tel quel. Ne réinvente pas
  le design.
- **Stack** (cf. spec) : Node + TypeScript, site **Astro**, **Postgres**
  (Railway), **cron UTC** (Railway), synthèse via **API Anthropic**. Tout sur
  Railway. Dépôt open source GitHub, slug `almanach`.
- **Modèle temporel** : génération nocturne ~00 h 01 (America/Toronto) décrivant
  **la veille** ; l'édition est figée. L'« en direct » est délégué aux liens
  sources. Seules les **éphémérides** regardent **ce soir**.
- **Sources** : Tempest `41129` (météo + foudre + lux + **historique depuis
  2021** pour la comparaison, avec la **règle des trous** du §9.1) ; BirdWeather
  `6670` (détections + **`soundscape` audio** du §9.2) ; `astronomy-engine` en
  local ; NOAA SWPC (aurores). Open-Meteo = **couverture nuageuse seulement**.
- **CSS structurel, pas sur-poli** : fais fonctionner le rendu dynamique à
  partir de la BD en réutilisant le système des maquettes. Ne cherche pas la
  perfection typographique ici — espace, rythme et détails seront le travail du
  pass suivant. L'objectif est un v1 juste et propre, pas léché.
- **Anti-hallucination (§10)** : aucune donnée inventée, recalculée ou
  paraphrasée. **Verbatim de la source ou rien.** Là où une maquette montre une
  valeur illustrative, câble la vraie donnée ; si elle manque, n'invente pas.
- **Demander avant de coder** : signale et pose la question plutôt que d'assumer
  sur les points laissés ouverts par le spec — notamment (a) si l'accès au média
  audio BirdWeather exige le jeton de station, et (b) la profondeur réelle de
  l'historique Tempest accessible par jeton perso (la règle des trous reste
  valable sur la fenêtre réellement disponible).

## Livrables attendus

- Dépôt structuré : schéma SQL, ingestion des sources, étape de synthèse
  (charge `prompts/editorial-voice.md`), build Astro, job cron, `.env.example`.
- Les **trois pages rendues depuis la BD** — la une, les archives, l'à propos —
  reproduisant fidèlement les maquettes.
- README court : mise en route locale + déploiement Railway + variables d'env.

## Après ce pass

v1 fonctionnel → **Impeccable** dans le même Claude Code (`/critique` puis
`/audit`, code existant traité comme contenu via `.impeccable.md`) → finir le
câblage et le branchement réel des sources. Une seule boucle, pas de hand-off
vers un second outil.
