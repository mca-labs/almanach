import { Observer } from 'astronomy-engine';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`${name} is not a number: ${raw}`);
  return n;
}

// Observateur figé : pont couvert de Saint-Placide. Valeurs verbatim
// validées contre l'API Tempest.
export const OBSERVER = new Observer(
  num('OBS_LAT', 47.40744),
  num('OBS_LON', -70.61846),
  num('OBS_ELEV_M', 377),
);

export const LOCAL_TZ = process.env['TZ'] ?? 'America/Toronto';
