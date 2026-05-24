// Orchestrateur quotidien. Lancé par le cron Railway `1 5 * * *` UTC
// (= 00:01 EST / 01:01 EDT). Chaque étape est aussi invocable seule via
// le CLI (cf. src/cli.ts).

import { sql } from '../db/client.js';
import { persistSkyEvents } from '../almanac/index.js';
import { birdweatherModule } from '../ingest/birdweather/index.js';
import { tempestModule } from '../ingest/tempest/index.js';
import { resolveMany } from '../resolver/species-photo.js';
import { synthesizeForDate } from '../synthesize/index.js';

const TZ = 'America/Toronto';

function localDate(d: Date, offsetDays = 0): string {
  // En-CA produit YYYY-MM-DD ; on calcule via toLocaleDateString pour le TZ.
  const t = new Date(d.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t);
}

async function publish(entryDate: string): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    update journal_entries
       set status = 'published', published_at = now()
     where entry_date = ${entryDate}::date and status = 'draft'
     returning id
  `;
  if (rows.length === 0) {
    console.log(`publish: aucun draft pour ${entryDate}.`);
    return;
  }
  const hook = process.env.SITE_DEPLOY_HOOK_URL;
  if (hook) {
    try {
      const res = await fetch(hook, { method: 'POST' });
      console.log(`publish: deploy hook ${res.status}`);
    } catch (err) {
      console.warn('publish: deploy hook failed', err);
    }
  } else {
    console.log('publish: pas de SITE_DEPLOY_HOOK_URL configuré.');
  }
  console.log(`publish: ${rows.length} entrée(s) publiée(s).`);
}

export async function runDaily(opts: { date?: string } = {}): Promise<void> {
  const now = new Date();
  const entryDate = opts.date ?? localDate(now, -1); // veille = jour décrit
  const skyDate = localDate(new Date(entryDate + 'T12:00:00Z'), 1); // « ce soir »
  // Fenêtre d'ingestion : 48 h pour avoir de la marge en cas de panne.
  const since = new Date(now.getTime() - 2 * 86400000);

  console.log(`daily: entryDate=${entryDate} skyDate=${skyDate}`);
  console.log('1/5 ingest…');
  await tempestModule.ingest(since);
  await birdweatherModule.ingest(since);

  console.log('2/5 resolve species photos (iNat, cached)…');
  const speciesRows = await sql<{ taxon_scientific: string }[]>`
    select distinct taxon_scientific
    from observations
    where source = 'birdweather' and kind = 'bird_audio'
      and taxon_scientific is not null
      and (observed_at at time zone 'America/Toronto')::date = ${entryDate}::date
  `;
  await resolveMany(speciesRows.map((r) => r.taxon_scientific));

  console.log('3/5 almanac…');
  await persistSkyEvents(skyDate);

  console.log('4/5 synthesize…');
  await synthesizeForDate(entryDate);

  console.log('5/5 publish…');
  await publish(entryDate);
}
