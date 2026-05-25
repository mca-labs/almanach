# Backlog — Almanach du Val-des-Loups

Source de vérité pour ce qui est en cours, à venir, et reporté.
Format léger : trois sections, items courts, contexte minimal. Quand un item passe à « Fait », le retirer (le commit history et le `CHANGELOG` éventuel font l'archive).

---

## Maintenant

_(rien en cours — la mise en ligne du 25 mai 2026 est complète)_

---

## Bientôt

- **Caractérisation du milieu** — ajouter une sous-section dans « Le lieu » de la page À propos : région écologique, sous-domaine bioclimatique, type de peuplement forestier, etc.
- **Passe Impeccable** — invoquer `/teach-impeccable` pour générer `.impeccable.md`, puis `/critique` et `/audit` sur le code traité comme contenu. Pass 2 du workflow documenté dans `session-handoff`.
- **Direction du vent en texte** (« O », « NO », « SSO »…) — dériver de `wind_direction_deg` moyen dans `WeatherDaily`. Affichage dans la carte Vent de la section Météo.

---

## Plus tard

- **Pression atmosphérique** — Tempest collecte `station_pressure_mb` (colonne 6 du flux). À agréger dans `WeatherDaily` puis afficher dans la carte Pression (actuellement « — · à venir » sur l'accueil).
- **« Dernier éclair il y a X j »** — tracker `lightning_strike_last_epoch` à travers les jours. Actuellement on affiche le count du jour seulement.
- **« Rare au secteur »** dans Premières de la saison — exige une baseline régionale via API eBird. Hors API gratuite simple, reporté.
- **Titres `null` fréquents** — avec les contraintes de format renforcées, Claude est devenu conservateur et omet souvent le titre. La page tombe sur le fallback "Almanach du Val-des-Loups". À assouplir au prompt si on veut un titre par jour.
- **Protection contre écrasement** d'éditions existantes dans `daily.ts` — si `data/editions/YYYY-MM-DD.json` existe déjà, skip sauf `--force`. Aujourd'hui un `workflow_dispatch` sans `date` régénère l'édition d'hier et écrase le texte (Claude non-déterministe).
- **Newsletter / RSS** — éventuel flux pour qui veut être notifié des nouvelles éditions.
- **Pages saisonnières** — vue par saison ou par mois dans les archives quand le corpus grossira.

---

## Maintenance saisonnière (DST)

GitHub Actions cron est en UTC fixe. Le cron `5 4 * * *` UTC tourne à 00:05 EDT (été). Aux transitions :

- **1er dim. de novembre** (fin EDT, début EST, UTC−5) → repasser à `5 5 * * *` dans `.github/workflows/daily.yml`.
- **2e dim. de mars** (fin EST, début EDT, UTC−4) → repasser à `5 4 * * *`.

Sinon le cron tourne 1h avant minuit local et `entryDate = hier` est off d'un jour.
