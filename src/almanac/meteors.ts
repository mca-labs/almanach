// Pluies d'étoiles annuelles — calendrier IMO figé.
// Source : International Meteor Organization (https://www.imo.net/), table
// reprise verbatim. Pas de feed temps réel (cf. spec §9.3).
// Notable si le pic est à <= 5 jours du for_date.

import type { SkyEventDraft } from './types.js';

interface MeteorShower {
  name: string;
  /** Pic — mois (1..12) et jour. */
  peakMonth: number;
  peakDay: number;
  /** Zenith Hourly Rate, indicatif. */
  zhr: number;
  /** Plage active approximative pour info. */
  activeStart: string; // MM-DD
  activeEnd: string;
}

export const SHOWERS: MeteorShower[] = [
  {
    name: 'Quadrantides',
    peakMonth: 1,
    peakDay: 4,
    zhr: 120,
    activeStart: '12-28',
    activeEnd: '01-12',
  },
  {
    name: 'Lyrides',
    peakMonth: 4,
    peakDay: 22,
    zhr: 18,
    activeStart: '04-14',
    activeEnd: '04-30',
  },
  {
    name: 'Êta aquarides',
    peakMonth: 5,
    peakDay: 6,
    zhr: 50,
    activeStart: '04-19',
    activeEnd: '05-28',
  },
  {
    name: 'Perséides',
    peakMonth: 8,
    peakDay: 12,
    zhr: 100,
    activeStart: '07-17',
    activeEnd: '08-24',
  },
  {
    name: 'Orionides',
    peakMonth: 10,
    peakDay: 21,
    zhr: 20,
    activeStart: '10-02',
    activeEnd: '11-07',
  },
  {
    name: 'Léonides',
    peakMonth: 11,
    peakDay: 17,
    zhr: 15,
    activeStart: '11-06',
    activeEnd: '11-30',
  },
  {
    name: 'Géminides',
    peakMonth: 12,
    peakDay: 14,
    zhr: 150,
    activeStart: '12-04',
    activeEnd: '12-20',
  },
  {
    name: 'Ursides',
    peakMonth: 12,
    peakDay: 22,
    zhr: 10,
    activeStart: '12-17',
    activeEnd: '12-26',
  },
];

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function computeMeteorShowers(forDate: string): SkyEventDraft[] {
  const events: SkyEventDraft[] = [];
  const [yStr] = forDate.split('-');
  const year = Number(yStr);
  const target = new Date(`${forDate}T00:00:00Z`);

  for (const s of SHOWERS) {
    // Cherche le pic le plus proche (cette année ou l'année suivante pour les Quadrantides début janvier).
    const candidates = [
      new Date(Date.UTC(year, s.peakMonth - 1, s.peakDay)),
      new Date(Date.UTC(year + 1, s.peakMonth - 1, s.peakDay)),
      new Date(Date.UTC(year - 1, s.peakMonth - 1, s.peakDay)),
    ];
    const nearest = candidates.reduce((acc, d) =>
      Math.abs(daysBetween(target, d)) < Math.abs(daysBetween(target, acc)) ? d : acc,
    );
    const offset = daysBetween(target, nearest);

    if (offset >= -1 && offset <= 5) {
      events.push({
        for_date: forDate,
        category: 'meteor_shower',
        title: offset === 0 ? `Pic des ${s.name}` : `${s.name} — pic dans ${offset} j`,
        detail: {
          peak_date: nearest.toISOString().slice(0, 10),
          days_to_peak: offset,
          zhr: s.zhr,
          active_window: `${s.activeStart} → ${s.activeEnd}`,
        },
        notable: true,
        propice_a: 'guetter les filantes après le crépuscule astronomique',
        source: 'imo',
      });
    }
  }

  return events;
}
