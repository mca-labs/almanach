// Orchestrateur quotidien. Lance ingest + almanach + photos + synthèse,
// écrit des fichiers JSON dans data/. Aucune persistance externe.

import { readdir } from 'node:fs/promises';
import { computeSkyDaily } from './almanac.js';
import { fetchDayDetections } from './sources/birdweather.js';
import { resolvePhoto, type PhotoCache } from './sources/inat.js';
import { computeHistoricalNorm, fetchDailyAggregate } from './sources/tempest.js';
import { synthesize, type Quote } from './synthesize.js';
import { localDate } from './util/date.js';
import { readJson, writeJson } from './util/json.js';

const DATA_DIR = 'data';

interface QuotesFile {
  citations: Quote[];
}

/**
 * Liste les N dernières dates antérieures à `beforeDate` qui ont un fichier dans
 * `data/{subdir}/`. Sert à charger l'historique récent (citations, oiseaux du jour, etc.).
 */
async function recentDates(subdir: string, beforeDate: string, days: number): Promise<string[]> {
  try {
    const files = await readdir(`${DATA_DIR}/${subdir}`);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter((d) => d < beforeDate)
      .sort()
      .slice(-days);
  } catch {
    return [];
  }
}

/**
 * IDs des citations utilisées dans les N derniers jours (strictement avant `beforeDate`).
 * Sert à éviter que Claude rechoisisse la même citation jour après jour : on filtre
 * la liste passée au prompt pour exclure les récentes.
 */
async function recentQuoteIds(beforeDate: string, days: number): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const d of await recentDates('editions', beforeDate, days)) {
    const e = await readJson<{ fragment_quote_id?: string | null }>(
      `${DATA_DIR}/editions/${d}.json`,
    );
    if (e?.fragment_quote_id) ids.add(e.fragment_quote_id);
  }
  return ids;
}

/**
 * Noms scientifiques des « oiseaux du jour » des N derniers jours.
 * Permet de pondérer la sélection par fréquence × nouveauté (cf. fetchDayDetections).
 */
async function recentBirdOfDayScis(beforeDate: string, days: number): Promise<Set<string>> {
  const scis = new Set<string>();
  for (const d of await recentDates('birds', beforeDate, days)) {
    const b = await readJson<{ bird_of_the_day?: { taxon_scientific?: string | null } | null }>(
      `${DATA_DIR}/birds/${d}.json`,
    );
    const sci = b?.bird_of_the_day?.taxon_scientific;
    if (sci) scis.add(sci);
  }
  return scis;
}

export async function runDaily(opts: { date?: string } = {}): Promise<void> {
  const now = new Date();
  const entryDate = opts.date ?? localDate(now, -1);
  // « Ce soir » du point de vue du lecteur du matin : le soir qui suit le
  // jour décrit. Si --date est fourni, sky = entryDate + 1.
  const skyDate = opts.date
    ? localDate(new Date(`${entryDate}T12:00:00Z`), 1)
    : localDate(now, 0);

  console.log(`daily: entryDate=${entryDate} skyDate=${skyDate}`);

  console.log('1/5 weather (Tempest)…');
  const weather = await fetchDailyAggregate(entryDate);
  // Calcul de la moyenne historique « même date » à partir des fichiers
  // déjà sur disque (issus du backfill). Règle des trous : 80% min/jour.
  const norm = await computeHistoricalNorm(entryDate, `${DATA_DIR}/weather`);
  weather.hourly_norm_c = norm.hourly_norm_c;
  weather.norm_years_used = norm.norm_years_used;
  await writeJson(`${DATA_DIR}/weather/${entryDate}.json`, weather);
  console.log(
    `     obs_count=${weather.obs_count}, temp avg=${weather.air_temp_avg_c?.toFixed(1) ?? 'n/a'}°C, norm: ${weather.norm_years_used} années`,
  );

  console.log('2/5 birds (BirdWeather)…');
  const recentBirdScis = await recentBirdOfDayScis(entryDate, 7);
  const birds = await fetchDayDetections(entryDate, { excludeScis: recentBirdScis });
  await writeJson(`${DATA_DIR}/birds/${entryDate}.json`, birds);
  console.log(`     detections=${birds.total_detections}, unique species=${birds.unique_species}`);

  console.log('3/5 photos (iNat, cached)…');
  const photosPath = `${DATA_DIR}/inat-photos.json`;
  const photos = (await readJson<PhotoCache>(photosPath)) ?? {};
  const uniqueScis = new Set<string>();
  for (const s of birds.top_species) uniqueScis.add(s.taxon_scientific);
  if (birds.bird_of_the_day?.taxon_scientific) {
    uniqueScis.add(birds.bird_of_the_day.taxon_scientific);
  }
  for (const sci of uniqueScis) {
    try {
      await resolvePhoto(sci, photos);
    } catch (err) {
      console.warn(`     resolvePhoto(${sci}) failed:`, (err as Error).message);
    }
  }
  await writeJson(photosPath, photos);
  console.log(`     ${uniqueScis.size} species probed, cache now has ${Object.keys(photos).length} entries`);

  console.log('4/5 sky (almanac)…');
  const sky = await computeSkyDaily(skyDate);
  await writeJson(`${DATA_DIR}/sky/${skyDate}.json`, sky);
  console.log(`     ${sky.events.length} events, cloud=${sky.cloud_cover_night_pct?.toFixed(0) ?? 'n/a'}%`);

  console.log('5/5 synthesize (Claude)…');
  const quotes = (await readJson<QuotesFile>(`${DATA_DIR}/quotes.json`)) ?? { citations: [] };
  // Rotation : on exclut les citations utilisées dans les 7 derniers jours.
  // Si la liste filtrée devient trop courte (< 3), on retombe sur la liste complète.
  const recentIds = await recentQuoteIds(entryDate, 7);
  const eligible = quotes.citations.filter((q) => !recentIds.has(q.id));
  const finalQuotes = eligible.length >= 3 ? eligible : quotes.citations;
  console.log(
    `     ${recentIds.size} citation(s) utilisée(s) ≤ 7j, ${finalQuotes.length} éligible(s) sur ${quotes.citations.length}`,
  );
  const billet = await synthesize({
    date: entryDate,
    sky_date: skyDate,
    weather,
    birds,
    sky,
    quotes_available: finalQuotes,
  });
  await writeJson(`${DATA_DIR}/editions/${entryDate}.json`, {
    entry_date: entryDate,
    generated_at: new Date().toISOString(),
    ...billet,
  });
  console.log(`     title="${billet.title ?? '(no title)'}", body_md=${billet.body_md.length} chars`);

  console.log(`✓ daily: edition ${entryDate} written.`);
}
