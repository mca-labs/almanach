/**
 * Sondes d'historique sur data/weather/. Partagé par l'orchestrateur quotidien
 * (src/daily.ts) et le rafraîchissement ponctuel (scripts/refresh-weather.ts)
 * pour que les deux chemins produisent exactement les mêmes champs dérivés.
 */

import { readJson } from './json.js';

const DATA_DIR = 'data';

/** Seuil de pluie « mesurable » : sous 0,2 mm, c'est de la rosée ou du bruit de capteur. */
export const RAIN_MEASURABLE_MM = 0.2;

/**
 * Nombre de jours écoulés depuis la dernière pluie mesurable, jour courant inclus
 * (0 = il a plu aujourd'hui, 1 = il a plu hier).
 *
 * Retourne `null` quand la réponse est inconnaissable — soit qu'aucune pluie
 * n'apparaisse dans les `maxDaysBack` derniers jours, soit qu'un fichier manque
 * dans l'intervalle. Un trou d'historique ne vaut pas une journée sèche : c'est
 * précisément l'amalgame qui fait écrire « pas une goutte depuis une semaine »
 * un lendemain de pluie.
 */
export async function daysSinceRain(
  date: string,
  currentDayMm: number | null,
  maxDaysBack = 365,
): Promise<number | null> {
  if ((currentDayMm ?? 0) > RAIN_MEASURABLE_MM) return 0;
  const base = new Date(`${date}T12:00:00Z`);
  for (let d = 1; d <= maxDaysBack; d++) {
    const probe = new Date(base.getTime() - d * 86400000);
    const ds = probe.toISOString().slice(0, 10);
    const w = await readJson<{ rain_day_final_mm?: number | null }>(
      `${DATA_DIR}/weather/${ds}.json`,
    );
    if (w === null) return null; // trou d'historique : on ne conclut pas
    if ((w.rain_day_final_mm ?? 0) > RAIN_MEASURABLE_MM) return d;
  }
  return null;
}
