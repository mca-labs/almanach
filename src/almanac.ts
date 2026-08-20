// Almanach prospectif : éphémérides, aurores, pluies d'étoiles, couverture
// nuageuse pour le « propice à quoi ». Tout est calculé ; aucune donnée
// inventée.

import * as Astronomy from 'astronomy-engine';

import { config, envOrNumber } from './config.js';
import { localMidnight } from './util/date.js';

type AstroTime = Astronomy.AstroTime;
const {
  Body,
  Equator,
  Horizon,
  Illumination,
  MoonPhase,
  Observer,
  SearchAltitude,
  SearchMoonPhase,
  SearchRiseSet,
} = Astronomy;

// --- Observateur : position déclarée dans almanach.config.json ---
// Saisie à la main, jamais dérivée des appareils (cf. le commentaire de config).
// Les variables d'environnement restent prioritaires pour les cas ponctuels.
const OBSERVER = new Observer(
  envOrNumber('OBS_LAT', config.location.latitude),
  envOrNumber('OBS_LON', config.location.longitude),
  envOrNumber('OBS_ELEV_M', config.location.elevation_m),
);

/** Azimut (0=N, 90=E, 180=S, 270=O) et altitude (degrés) d'un corps à un instant
 *  donné, vus de l'observateur. Sert à positionner la « carte du ciel ». */
function altAz(body: Astronomy.Body, time: AstroTime): { az: number; alt: number } {
  const eq = Equator(body, time, OBSERVER, true, true);
  const hor = Horizon(time, OBSERVER, eq.ra, eq.dec, 'normal');
  return { az: round1(hor.azimuth), alt: round1(hor.altitude) };
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// --- Types ---
export type SkyCategory =
  | 'moon'
  | 'planet'
  | 'twilight'
  | 'aurora'
  | 'meteor_shower'
  // Les quatre suivantes ne sont PAS rendues comme lignes d'icône dans la carte :
  // elles n'existent que pour la prose (cf. sky_narrative dans synthesize.ts).
  | 'season'
  | 'eclipse'
  | 'supermoon'
  | 'sun_extreme';

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

  // Instant de référence pour la « carte du ciel » : fin du crépuscule civil
  // (le ciel s'assombrit, les planètes apparaissent), repli sur le coucher.
  const refTime = civilEnd ?? nauticalEnd ?? sunset;

  events.push({
    category: 'twilight',
    title: 'Lever et coucher du soleil',
    detail: {
      sunrise: iso(sunrise),
      sunset: iso(sunset),
      sun_set_azimuth: sunset ? altAz(Body.Sun, sunset).az : null,
      sky_map_ref: iso(refTime),
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
    const pos = refTime ? altAz(p.body, refTime) : null;
    events.push({
      category: 'planet',
      title: p.name,
      detail: {
        magnitude: illum.mag,
        phase_angle: illum.phase_angle,
        helio_dist: illum.helio_dist,
        geo_dist: illum.geo_dist,
        az: pos?.az ?? null,
        alt: pos?.alt ?? null,
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
    // Le produit SWPC renvoie un tableau d'OBJETS { time_tag, kp, observed }.
    // L'ancien code le lisait comme un tableau de tableaux (r[0], r[1]) avec une
    // ligne d'en-tête : chaque ligne rendait `undefined`, le filtre ne gardait
    // rien, et la fonction retournait null sans bruit. Résultat : pas un seul
    // événement « aurora » écrit depuis la mise en service.
    const data = (await res.json()) as Array<{ time_tag?: string; kp?: number }>;
    // `time_tag` est en UTC. La nuit de `forDate` (soir local → aube du lendemain)
    // couvre en UTC forDate 22 h → forDate+1 12 h : c'est cette fenêtre qui
    // intéresse un guetteur, pas la journée UTC de forDate.
    const from = Date.parse(`${forDate}T22:00:00Z`);
    const to = from + 14 * 3600_000;
    const sameDay = data.filter((r) => {
      if (!r.time_tag || typeof r.kp !== 'number') return false;
      const t = Date.parse(`${r.time_tag}Z`.replace(/Z+$/, 'Z'));
      return Number.isFinite(t) && t >= from && t <= to;
    });
    // Le produit ne couvre que ~3 jours : une date hors de cette plage n'est pas
    // une anomalie (backfill, régénération d'un vieux jour), c'est juste hors
    // portée. On ne signale que ce qui est vraiment suspect.
    const stamps = data
      .map((r) => (r.time_tag ? Date.parse(`${r.time_tag}Z`) : NaN))
      .filter((n) => Number.isFinite(n));
    const covered =
      stamps.length > 0 && from >= Math.min(...stamps) && from <= Math.max(...stamps);
    if (sameDay.length === 0 && !covered) return null;
    if (sameDay.length === 0) {
      // Bruyant à dessein : un format qui change de nouveau doit se voir dans les
      // logs du cron plutôt que de désactiver la fonctionnalité en silence.
      console.warn(
        `aurora: aucune prévision Kp pour la nuit du ${forDate} ` +
          `(${data.length} lignes reçues) — format changé ou hors fenêtre de prévision ?`,
      );
      return null;
    }
    const maxKp = Math.max(...sameDay.map((r) => r.kp as number));
    const notable = maxKp >= KP_THRESHOLD;
    return {
      category: 'aurora',
      title: notable ? `Aurores possibles (Kp ${maxKp})` : `Kp prévu ${maxKp}`,
      detail: {
        kp_max: maxKp,
        threshold: KP_THRESHOLD,
        hours_utc: sameDay.map((r) => ({ time: r.time_tag, kp: r.kp })),
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

// --- Solstices, équinoxes, éclipses, superlune, extrêmes du Soleil ---
// Tout est calculé hors-ligne par astronomy-engine, sans clé ni appel réseau.
// Aucune de ces catégories n'a d'icône : elles alimentent uniquement la prose.

/** Date locale (YYYY-MM-DD, fuseau du lieu) d'un instant astronomique. */
function localDayOf(t: AstroTime): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.location.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t.date);
}

function dayGap(forDate: string, t: AstroTime): number {
  return daysBetween(new Date(`${forDate}T00:00:00Z`), new Date(`${localDayOf(t)}T00:00:00Z`));
}

/** Solstices et équinoxes : annoncés 3 jours avant, et le jour même. */
function computeSeasons(forDate: string): SkyEvent[] {
  const year = Number(forDate.split('-')[0]);
  const out: SkyEvent[] = [];
  for (const y of [year - 1, year, year + 1]) {
    const s = Astronomy.Seasons(y);
    const marks: Array<[string, AstroTime]> = [
      ['Équinoxe de printemps', s.mar_equinox],
      ['Solstice d’été', s.jun_solstice],
      ['Équinoxe d’automne', s.sep_equinox],
      ['Solstice d’hiver', s.dec_solstice],
    ];
    for (const [nom, t] of marks) {
      const offset = dayGap(forDate, t);
      if (offset < 0 || offset > 3) continue;
      out.push({
        category: 'season',
        title: offset === 0 ? nom : `${nom} dans ${offset} j`,
        detail: { instant_utc: t.date.toISOString(), local_date: localDayOf(t), days_ahead: offset },
        notable: offset === 0,
        propice_a: null,
        source: 'astronomy-engine',
      });
    }
  }
  return out;
}

/**
 * Éclipses de Lune et de Soleil, avec les circonstances LOCALES du Val : une
 * éclipse dont le maximum se produit sous l'horizon d'ici n'a aucun intérêt
 * pour le lecteur, on la marque non notable plutôt que de la taire.
 */
function computeEclipses(forDate: string): SkyEvent[] {
  const out: SkyEvent[] = [];
  const from = new Date(`${forDate}T00:00:00Z`);
  const search = new Date(from.getTime() - 3 * 86400000);

  try {
    const lun = Astronomy.SearchLunarEclipse(search);
    const offset = dayGap(forDate, lun.peak);
    if (offset >= 0 && offset <= 3) {
      // Hauteur de la Lune au maximum : négative = sous l'horizon, invisible ici.
      const eq = Equator(Body.Moon, lun.peak, OBSERVER, true, true);
      const alt = round1(Horizon(lun.peak, OBSERVER, eq.ra, eq.dec, 'normal').altitude);
      out.push({
        category: 'eclipse',
        title:
          (offset === 0 ? 'Éclipse de Lune' : `Éclipse de Lune dans ${offset} j`) +
          ` (${lun.kind})`,
        detail: {
          body: 'moon',
          kind: lun.kind,
          peak_utc: lun.peak.date.toISOString(),
          local_date: localDayOf(lun.peak),
          days_ahead: offset,
          obscuration: lun.obscuration,
          moon_altitude_deg_at_peak: alt,
          visible_ici: alt > 0,
        },
        notable: alt > 0,
        propice_a: null,
        source: 'astronomy-engine',
      });
    }
  } catch {
    /* aucune éclipse trouvée dans la fenêtre : rien à dire */
  }

  try {
    const sol = Astronomy.SearchLocalSolarEclipse(search, OBSERVER);
    const offset = dayGap(forDate, sol.peak.time);
    if (offset >= 0 && offset <= 3) {
      out.push({
        category: 'eclipse',
        title:
          (offset === 0 ? 'Éclipse de Soleil' : `Éclipse de Soleil dans ${offset} j`) +
          ` (${sol.kind})`,
        detail: {
          body: 'sun',
          kind: sol.kind,
          peak_utc: sol.peak.time.date.toISOString(),
          local_date: localDayOf(sol.peak.time),
          days_ahead: offset,
          obscuration: sol.obscuration,
          sun_altitude_deg_at_peak: round1(sol.peak.altitude),
          partial_begin_utc: sol.partial_begin.time.date.toISOString(),
          partial_end_utc: sol.partial_end.time.date.toISOString(),
          visible_ici: sol.peak.altitude > 0,
        },
        notable: sol.peak.altitude > 0,
        propice_a: null,
        source: 'astronomy-engine',
      });
    }
  } catch {
    /* idem */
  }
  return out;
}

/**
 * Superlune : pleine Lune tombant à moins de `SUPERMOON_MAX_KM` du périgée.
 * Le seuil usuel (~360 000 km) retient 3 à 4 pleines lunes par an.
 */
const SUPERMOON_MAX_KM = 360_000;

function computeSupermoon(forDate: string): SkyEvent[] {
  const search = new Date(`${forDate}T00:00:00Z`);
  // Pleine Lune : longitude écliptique Lune-Soleil = 180°.
  const full = SearchMoonPhase(180, new Date(search.getTime() - 2 * 86400000), 40);
  if (!full) return [];
  const offset = dayGap(forDate, full);
  if (offset < 0 || offset > 2) return [];

  // Périgée le plus proche de cette pleine Lune.
  let apsis = Astronomy.SearchLunarApsis(new Date(full.date.getTime() - 20 * 86400000));
  let best: Astronomy.Apsis | null = null;
  for (let i = 0; i < 6; i++) {
    if (apsis.kind === Astronomy.ApsisKind.Pericenter) {
      if (!best || Math.abs(apsis.time.date.getTime() - full.date.getTime()) <
                   Math.abs(best.time.date.getTime() - full.date.getTime())) best = apsis;
    }
    apsis = Astronomy.NextLunarApsis(apsis);
  }
  if (!best) return [];

  const distKm = Math.round(best.dist_km);
  if (distKm > SUPERMOON_MAX_KM) return [];
  const hoursApart = Math.round(
    Math.abs(best.time.date.getTime() - full.date.getTime()) / 3600_000,
  );
  return [
    {
      category: 'supermoon',
      title: offset === 0 ? 'Superlune' : `Superlune dans ${offset} j`,
      detail: {
        full_moon_utc: full.date.toISOString(),
        local_date: localDayOf(full),
        days_ahead: offset,
        perigee_distance_km: distKm,
        hours_from_perigee: hoursApart,
      },
      notable: true,
      propice_a: null,
      source: 'astronomy-engine',
    },
  ];
}

/**
 * Coucher le plus hâtif et lever le plus tardif de l'année. Ils ne tombent PAS
 * au solstice — décalage dû à l'équation du temps — et c'est précisément ce qui
 * en fait une curiosité d'almanach. Balayage de l'année entière, puis on ne
 * signale que si `forDate` est le jour trouvé (ou la veille).
 */
function computeSunExtremes(forDate: string): SkyEvent[] {
  const year = Number(forDate.split('-')[0]);
  type Extreme = { day: string; minutes: number; clock: string };
  let earliestSet: Extreme | null = null;
  let latestRise: Extreme | null = null;

  for (let d = 0; d < 366; d++) {
    const t = new Date(Date.UTC(year, 0, 1 + d));
    if (t.getUTCFullYear() !== year) break;
    const day = t.toISOString().slice(0, 10);
    const start = localMidnight(day);
    const set = SearchRiseSet(Body.Sun, OBSERVER, -1, start, 1);
    const rise = SearchRiseSet(Body.Sun, OBSERVER, +1, start, 1);
    // Classement en HEURE NORMALE, jamais en heure d'horloge locale : en heure
    // avancée, le lever recule d'une heure d'un coup, et le « plus tardif »
    // tomberait la veille du retour à l'heure normale (le 6 novembre 2027, par
    // exemple) au lieu du début janvier. Artefact d'horloge, pas d'astronomie.
    if (set) {
      const m = standardMinutes(set);
      if (!earliestSet || m < earliestSet.minutes) earliestSet = { day, minutes: m, clock: localClock(set) };
    }
    if (rise) {
      const m = standardMinutes(rise);
      if (!latestRise || m > latestRise.minutes) latestRise = { day, minutes: m, clock: localClock(rise) };
    }
  }

  const out: SkyEvent[] = [];
  const push = (label: string, hit: Extreme | null, key: string) => {
    if (!hit) return;
    const offset = daysBetween(new Date(`${forDate}T00:00:00Z`), new Date(`${hit.day}T00:00:00Z`));
    if (offset < 0 || offset > 1) return;
    out.push({
      category: 'sun_extreme',
      title: offset === 0 ? label : `${label} — demain`,
      // `local_time` est l'heure d'horloge réelle du jour (avec heure avancée si
      // elle s'applique) : c'est celle qu'on affiche. Le classement, lui, s'est
      // fait en heure normale — cf. computeSunExtremes.
      detail: {
        which: key,
        local_date: hit.day,
        days_ahead: offset,
        local_time: hit.clock,
        standard_minutes: hit.minutes,
      },
      notable: offset === 0,
      propice_a: null,
      source: 'astronomy-engine',
    });
  };
  push('Coucher du soleil le plus hâtif de l’année', earliestSet, 'earliest_sunset');
  push('Lever du soleil le plus tardif de l’année', latestRise, 'latest_sunrise');
  return out;
}

/**
 * Minutes depuis minuit en HEURE NORMALE du lieu (sans heure avancée). Sert au
 * seul classement des extrêmes du Soleil : comparer des heures d'horloge à
 * travers un changement d'heure compare des règles différentes, pas des jours.
 */
const STD_OFFSET_MIN = (() => {
  // Décalage du fuseau au 15 janvier : par construction, l'heure normale.
  const jan = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.location.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(jan);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m - 12 * 60;
})();

function standardMinutes(t: AstroTime): number {
  const utcMin = t.date.getUTCHours() * 60 + t.date.getUTCMinutes();
  return ((utcMin + STD_OFFSET_MIN) % 1440 + 1440) % 1440;
}

/** Heure d'horloge locale « HH h MM » du jour même (heure avancée incluse). */
function localClock(t: AstroTime): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.location.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(t.date);
  const h = p.find((x) => x.type === 'hour')?.value ?? '00';
  const m = p.find((x) => x.type === 'minute')?.value ?? '00';
  return `${h} h ${m}`;
}

// --- Couverture nuageuse nocturne via Open-Meteo ---
async function nightCloudCover(forDate: string): Promise<number | null> {
  const base = process.env.OPENMETEO_BASE ?? 'https://api.open-meteo.com/v1';
  const url =
    `${base}/forecast?latitude=${OBSERVER.latitude}&longitude=${OBSERVER.longitude}` +
    `&hourly=cloud_cover&start_date=${forDate}&end_date=${forDate}` +
    `&timezone=${encodeURIComponent(config.location.timezone)}`;
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
  // Catégories sans icône, destinées à la prose seule.
  events.push(...computeSeasons(forDate));
  events.push(...computeEclipses(forDate));
  events.push(...computeSupermoon(forDate));
  events.push(...computeSunExtremes(forDate));
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
