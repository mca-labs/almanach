// Almanach prospectif : éphémérides, aurores, pluies d'étoiles, couverture
// nuageuse pour le « propice à quoi ». Tout est calculé ; aucune donnée
// inventée.

import * as Astronomy from 'astronomy-engine';

import { localMidnight } from './util/date.js';

type AstroTime = Astronomy.AstroTime;
const { Body, Illumination, MoonPhase, Observer, SearchAltitude, SearchRiseSet } = Astronomy;

// --- Observateur figé : pont couvert de Saint-Placide ---
function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`${name} is not a number: ${raw}`);
  return n;
}
const OBSERVER = new Observer(
  num('OBS_LAT', 47.40744),
  num('OBS_LON', -70.61846),
  num('OBS_ELEV_M', 377),
);

// --- Types ---
export type SkyCategory =
  | 'moon'
  | 'planet'
  | 'twilight'
  | 'aurora'
  | 'meteor_shower';

export interface SkyEvent {
  category: SkyCategory;
  title: string;
  detail: Record<string, unknown>;
  notable: boolean;
  propice_a: string | null;
  source: 'astronomy-engine' | 'noaa-swpc' | 'imo';
}

export interface SkyDaily {
  for_date: string; // YYYY-MM-DD local — typiquement entry_date + 1 (« ce soir »)
  events: SkyEvent[];
  cloud_cover_night_pct: number | null;
}

// --- Éphémérides : crépuscules, lune, planètes ---
function iso(t: AstroTime | null): string | null {
  return t ? t.date.toISOString() : null;
}

function moonPhaseLabel(deg: number): string {
  if (deg < 5 || deg > 355) return 'Nouvelle lune';
  if (deg < 85) return 'Premier croissant';
  if (deg < 95) return 'Premier quartier';
  if (deg < 175) return 'Lune gibbeuse croissante';
  if (deg < 185) return 'Pleine lune';
  if (deg < 265) return 'Lune gibbeuse décroissante';
  if (deg < 275) return 'Dernier quartier';
  return 'Dernier croissant';
}

function propiceForMoon(label: string): string {
  if (label === 'Pleine lune') return 'marche sans frontale + observation lunaire';
  if (label === 'Nouvelle lune') return 'étoiles et ciel profond';
  return '';
}

function computeEphemerides(start: Date): SkyEvent[] {
  const events: SkyEvent[] = [];
  const sunrise = SearchRiseSet(Body.Sun, OBSERVER, +1, start, 1);
  const sunset = SearchRiseSet(Body.Sun, OBSERVER, -1, start, 1);
  const civilEnd = SearchAltitude(Body.Sun, OBSERVER, -1, start, 1, -6);
  const nauticalEnd = SearchAltitude(Body.Sun, OBSERVER, -1, start, 1, -12);
  const astroEnd = SearchAltitude(Body.Sun, OBSERVER, -1, start, 1, -18);
  const astroStart = SearchAltitude(Body.Sun, OBSERVER, +1, start, 1, -18);
  const nauticalStart = SearchAltitude(Body.Sun, OBSERVER, +1, start, 1, -12);
  const civilStart = SearchAltitude(Body.Sun, OBSERVER, +1, start, 1, -6);

  events.push({
    category: 'twilight',
    title: 'Lever et coucher du soleil',
    detail: {
      sunrise: iso(sunrise),
      sunset: iso(sunset),
      twilight: {
        civil_start: iso(civilStart),
        nautical_start: iso(nauticalStart),
        astronomical_start: iso(astroStart),
        astronomical_end: iso(astroEnd),
        nautical_end: iso(nauticalEnd),
        civil_end: iso(civilEnd),
      },
    },
    notable: false,
    propice_a: null,
    source: 'astronomy-engine',
  });

  const phaseDeg = MoonPhase(start);
  const moonIllum = Illumination(Body.Moon, start);
  const moonRise = SearchRiseSet(Body.Moon, OBSERVER, +1, start, 1);
  const moonSet = SearchRiseSet(Body.Moon, OBSERVER, -1, start, 1);
  const phaseLabel = moonPhaseLabel(phaseDeg);
  const notableMoon = phaseLabel === 'Pleine lune' || phaseLabel === 'Nouvelle lune';

  events.push({
    category: 'moon',
    title: phaseLabel,
    detail: {
      phase_deg: phaseDeg,
      illumination_fraction: moonIllum.phase_fraction,
      magnitude: moonIllum.mag,
      rise: iso(moonRise),
      set: iso(moonSet),
    },
    notable: notableMoon,
    propice_a: notableMoon ? propiceForMoon(phaseLabel) : null,
    source: 'astronomy-engine',
  });

  const planets = [
    { body: Body.Mercury, name: 'Mercure' },
    { body: Body.Venus, name: 'Vénus' },
    { body: Body.Mars, name: 'Mars' },
    { body: Body.Jupiter, name: 'Jupiter' },
    { body: Body.Saturn, name: 'Saturne' },
  ];
  for (const p of planets) {
    const illum = Illumination(p.body, start);
    events.push({
      category: 'planet',
      title: p.name,
      detail: {
        magnitude: illum.mag,
        phase_angle: illum.phase_angle,
        helio_dist: illum.helio_dist,
        geo_dist: illum.geo_dist,
      },
      notable: illum.mag < 0,
      propice_a: null,
      source: 'astronomy-engine',
    });
  }

  return events;
}

// --- Aurores : NOAA SWPC ---
const KP_THRESHOLD = 5;

async function computeAurora(forDate: string): Promise<SkyEvent | null> {
  const base = process.env.NOAA_SWPC_BASE ?? 'https://services.swpc.noaa.gov';
  try {
    const res = await fetch(`${base}/products/noaa-planetary-k-index-forecast.json`);
    if (!res.ok) return null;
    const data = (await res.json()) as string[][];
    const sameDay = data.slice(1).filter((r) => r[0]?.startsWith(forDate));
    if (sameDay.length === 0) return null;
    const maxKp = Math.max(...sameDay.map((r) => Number(r[1])));
    const notable = maxKp >= KP_THRESHOLD;
    return {
      category: 'aurora',
      title: notable ? `Aurores possibles (Kp ${maxKp})` : `Kp prévu ${maxKp}`,
      detail: {
        kp_max: maxKp,
        threshold: KP_THRESHOLD,
        hours_utc: sameDay.map((r) => ({ time: r[0], kp: Number(r[1]) })),
      },
      notable,
      propice_a: notable ? 'guetter les aurores au nord après le crépuscule astronomique' : null,
      source: 'noaa-swpc',
    };
  } catch (err) {
    console.warn('aurora: fetch failed,', (err as Error).message);
    return null;
  }
}

// --- Pluies d'étoiles : table IMO figée ---
const SHOWERS = [
  { name: 'Quadrantides', month: 1, day: 4, zhr: 120 },
  { name: 'Lyrides', month: 4, day: 22, zhr: 18 },
  { name: 'Êta aquarides', month: 5, day: 6, zhr: 50 },
  { name: 'Perséides', month: 8, day: 12, zhr: 100 },
  { name: 'Orionides', month: 10, day: 21, zhr: 20 },
  { name: 'Léonides', month: 11, day: 17, zhr: 15 },
  { name: 'Géminides', month: 12, day: 14, zhr: 150 },
  { name: 'Ursides', month: 12, day: 22, zhr: 10 },
];

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function computeMeteorShowers(forDate: string): SkyEvent[] {
  const events: SkyEvent[] = [];
  const year = Number(forDate.split('-')[0]);
  const target = new Date(`${forDate}T00:00:00Z`);
  for (const s of SHOWERS) {
    const candidates = [
      new Date(Date.UTC(year, s.month - 1, s.day)),
      new Date(Date.UTC(year + 1, s.month - 1, s.day)),
      new Date(Date.UTC(year - 1, s.month - 1, s.day)),
    ];
    const nearest = candidates.reduce((acc, d) =>
      Math.abs(daysBetween(target, d)) < Math.abs(daysBetween(target, acc)) ? d : acc,
    );
    const offset = daysBetween(target, nearest);
    if (offset >= -1 && offset <= 5) {
      events.push({
        category: 'meteor_shower',
        title: offset === 0 ? `Pic des ${s.name}` : `${s.name} — pic dans ${offset} j`,
        detail: { peak_date: nearest.toISOString().slice(0, 10), days_to_peak: offset, zhr: s.zhr },
        notable: true,
        propice_a: 'guetter les filantes après le crépuscule astronomique',
        source: 'imo',
      });
    }
  }
  return events;
}

// --- Couverture nuageuse nocturne via Open-Meteo ---
async function nightCloudCover(forDate: string): Promise<number | null> {
  const base = process.env.OPENMETEO_BASE ?? 'https://api.open-meteo.com/v1';
  const url =
    `${base}/forecast?latitude=${OBSERVER.latitude}&longitude=${OBSERVER.longitude}` +
    `&hourly=cloud_cover&start_date=${forDate}&end_date=${forDate}&timezone=America/Toronto`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { hourly: { time: string[]; cloud_cover: number[] } };
    const idx = data.hourly.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => {
        const hour = Number(t.split('T')[1]?.slice(0, 2) ?? 0);
        return hour >= 20 || hour <= 4;
      })
      .map(({ i }) => i);
    if (idx.length === 0) return null;
    const vals = idx
      .map((i) => data.hourly.cloud_cover[i])
      .filter((v): v is number => typeof v === 'number');
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  } catch (err) {
    console.warn('cloud: fetch failed,', (err as Error).message);
    return null;
  }
}

// --- Orchestration ---
export async function computeSkyDaily(forDate: string): Promise<SkyDaily> {
  const start = localMidnight(forDate);
  const events: SkyEvent[] = [];

  events.push(...computeEphemerides(start));
  events.push(...computeMeteorShowers(forDate));
  const aurora = await computeAurora(forDate);
  if (aurora) events.push(aurora);

  const cloud = await nightCloudCover(forDate);
  // Si ciel très couvert (>=80%), on annule le « propice à quoi » des
  // événements astro — observation impossible.
  if (cloud !== null && cloud >= 80) {
    for (const ev of events) {
      if (ev.propice_a && (ev.category === 'moon' || ev.category === 'aurora' || ev.category === 'meteor_shower')) {
        ev.propice_a = null;
      }
    }
  }

  return { for_date: forDate, events, cloud_cover_night_pct: cloud };
}
