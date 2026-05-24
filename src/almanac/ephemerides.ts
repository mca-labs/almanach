// Éphémérides déterministes — astronomy-engine, calcul local.
// Aucune donnée inventée : tout est calculé depuis les coordonnées de
// l'observateur (cf. règles §8 et §9.3 du spec).

import * as Astronomy from 'astronomy-engine';
type AstroTime = Astronomy.AstroTime;
const { Body, Illumination, MoonPhase, SearchAltitude, SearchRiseSet } = Astronomy;

import { OBSERVER } from './observer.js';
import type { SkyEventDraft } from './types.js';

const SUN_RISE = +1;
const SUN_SET = -1;

function iso(t: AstroTime | null): string | null {
  return t ? t.date.toISOString() : null;
}

interface DayWindow {
  /** Local midnight (start of day) as JS Date. */
  start: Date;
  /** YYYY-MM-DD label for sky_events.for_date. */
  forDate: string;
}

/** Twilights, sunrise/sunset, moon rise/set + illumination for a given local day. */
export function computeDayEphemerides(win: DayWindow): SkyEventDraft[] {
  const events: SkyEventDraft[] = [];

  const sunrise = SearchRiseSet(Body.Sun, OBSERVER, SUN_RISE, win.start, 1);
  const sunset = SearchRiseSet(Body.Sun, OBSERVER, SUN_SET, win.start, 1);
  const civilEnd = SearchAltitude(Body.Sun, OBSERVER, SUN_SET, win.start, 1, -6);
  const nauticalEnd = SearchAltitude(Body.Sun, OBSERVER, SUN_SET, win.start, 1, -12);
  const astroEnd = SearchAltitude(Body.Sun, OBSERVER, SUN_SET, win.start, 1, -18);
  const astroStart = SearchAltitude(Body.Sun, OBSERVER, SUN_RISE, win.start, 1, -18);
  const nauticalStart = SearchAltitude(Body.Sun, OBSERVER, SUN_RISE, win.start, 1, -12);
  const civilStart = SearchAltitude(Body.Sun, OBSERVER, SUN_RISE, win.start, 1, -6);

  events.push({
    for_date: win.forDate,
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

  // Phase lunaire à minuit local : 0 = nouvelle, 90 = premier quartier,
  // 180 = pleine, 270 = dernier quartier (degrés d'élongation Lune-Soleil).
  const phaseDeg = MoonPhase(win.start);
  const moonIllum = Illumination(Body.Moon, win.start);
  const moonRise = SearchRiseSet(Body.Moon, OBSERVER, SUN_RISE, win.start, 1);
  const moonSet = SearchRiseSet(Body.Moon, OBSERVER, SUN_SET, win.start, 1);

  const phaseLabel = phaseLabelFr(phaseDeg);
  const notableMoon = phaseLabel === 'Pleine lune' || phaseLabel === 'Nouvelle lune';

  events.push({
    for_date: win.forDate,
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

  // Planètes visibles : magnitude < 1 + au-dessus de l'horizon au crépuscule.
  // Pour v1 on calcule juste la magnitude (le rendu décidera notable d'après seuils).
  const planetBodies = [
    { body: Body.Mercury, name: 'Mercure' },
    { body: Body.Venus, name: 'Vénus' },
    { body: Body.Mars, name: 'Mars' },
    { body: Body.Jupiter, name: 'Jupiter' },
    { body: Body.Saturn, name: 'Saturne' },
  ];
  for (const p of planetBodies) {
    const illum = Illumination(p.body, win.start);
    const notable = illum.mag < 0; // notable si très brillante
    events.push({
      for_date: win.forDate,
      category: 'planet',
      title: p.name,
      detail: {
        magnitude: illum.mag,
        phase_angle: illum.phase_angle,
        helio_dist: illum.helio_dist,
        geo_dist: illum.geo_dist,
      },
      notable,
      propice_a: null,
      source: 'astronomy-engine',
    });
  }

  return events;
}

function phaseLabelFr(deg: number): string {
  // Bornes ±5° autour des quarts pour les labels canoniques.
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
