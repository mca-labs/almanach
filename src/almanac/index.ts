import { sql } from '../db/client.js';

import { computeAurora } from './aurora.js';
import { nightCloudCover } from './cloud.js';
import { computeDayEphemerides } from './ephemerides.js';
import { computeMeteorShowers } from './meteors.js';
import type { SkyEventDraft } from './types.js';

/** Construit la date de minuit local pour un YYYY-MM-DD. */
function localMidnight(forDate: string): Date {
  // L'offset varie EDT/EST. On utilise toLocaleString pour gérer le TZ proprement.
  // L'astuce : on crée une date naïve "00:00" et on calcule le décalage vs UTC.
  const naive = new Date(`${forDate}T00:00:00`);
  const tzFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    timeZoneName: 'shortOffset',
  });
  const offset = tzFmt.formatToParts(naive).find((p) => p.type === 'timeZoneName')?.value;
  // shortOffset retourne "GMT-4" ou "GMT-5"
  const sign = offset?.includes('-') ? -1 : 1;
  const hours = Number(offset?.match(/\d+/)?.[0] ?? 5);
  return new Date(`${forDate}T00:00:00${sign === -1 ? '-' : '+'}${String(hours).padStart(2, '0')}:00`);
}

/** Module de l'almanach : produit les sky_events pour une date locale. */
export async function computeSkyEvents(forDate: string): Promise<SkyEventDraft[]> {
  const start = localMidnight(forDate);
  const drafts: SkyEventDraft[] = [];

  // Calcul déterministe (local).
  drafts.push(...computeDayEphemerides({ start, forDate }));

  // Pluies d'étoiles (table figée).
  drafts.push(...computeMeteorShowers(forDate));

  // Aurores (NOAA SWPC).
  const aurora = await computeAurora(forDate);
  if (aurora) drafts.push(aurora);

  // Modulation par la couverture nuageuse : on annule le « propice à quoi »
  // des événements astronomiques si la nuit est très couverte (>= 80%).
  const cloud = await nightCloudCover(forDate);
  if (cloud !== null && cloud >= 80) {
    for (const ev of drafts) {
      if (
        ev.propice_a &&
        (ev.category === 'moon' || ev.category === 'aurora' || ev.category === 'meteor_shower')
      ) {
        ev.propice_a = null;
        (ev.detail as Record<string, unknown>)['cloud_cover_night_pct'] = cloud;
      }
    }
  } else if (cloud !== null) {
    for (const ev of drafts) {
      (ev.detail as Record<string, unknown>)['cloud_cover_night_pct'] = cloud;
    }
  }

  return drafts;
}

/** Calcule + persiste les sky_events. Idempotent par (for_date, category, title). */
export async function persistSkyEvents(forDate: string): Promise<number> {
  const drafts = await computeSkyEvents(forDate);
  if (drafts.length === 0) return 0;
  // On supprime ceux du jour avant de réinsérer : l'almanach est rejouable.
  await sql`delete from sky_events where for_date = ${forDate}`;
  const result = await sql`
    insert into sky_events
      (for_date, category, title, detail, notable, propice_a, source)
    select
      x.for_date::date, x.category, x.title,
      x.detail::jsonb, x.notable, x.propice_a, x.source
    from json_to_recordset(${JSON.stringify(drafts)}::json) as x(
      for_date text, category text, title text,
      detail json, notable boolean, propice_a text, source text
    )
    returning id
  `;
  console.log(`almanac: for=${forDate} events=${result.length}`);
  return result.length;
}
