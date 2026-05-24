// NOAA SWPC — indice K planétaire prévu pour les prochains jours.
// À 47,4 °N, Kp >= 5 = visibilité aurorale possible vers le nord.
// Kp >= 6 = nettement plus probable. On marque notable à partir de 5.
//
// API publique, pas de clé. Réponse = tableau de chaînes :
// [["time_tag", "kp", "observed", "noaa_scale"], …]

import type { SkyEventDraft } from './types.js';

const KP_NOTABLE_THRESHOLD = 5;

function endpoint(): string {
  const base = process.env.NOAA_SWPC_BASE ?? 'https://services.swpc.noaa.gov';
  return `${base}/products/noaa-planetary-k-index-forecast.json`;
}

interface KpForecastRow {
  /** ISO 8601 UTC. */
  timeTag: string;
  /** Kp estimé (0..9). */
  kp: number;
  observed: string;
}

async function fetchForecast(): Promise<KpForecastRow[]> {
  const res = await fetch(endpoint());
  if (!res.ok) throw new Error(`NOAA SWPC HTTP ${res.status}`);
  const data = (await res.json()) as string[][];
  // Première ligne = en-têtes.
  return data.slice(1).map((row) => ({
    timeTag: row[0]!,
    kp: Number(row[1]!),
    observed: row[2]!,
  }));
}

/** Garde le Kp max prévu pour le jour local donné. */
export async function computeAurora(forDate: string): Promise<SkyEventDraft | null> {
  let rows: KpForecastRow[];
  try {
    rows = await fetchForecast();
  } catch (err) {
    console.warn('aurora: fetch failed, omitting', err);
    return null;
  }

  const sameDay = rows.filter((r) => r.timeTag.startsWith(forDate));
  if (sameDay.length === 0) return null;

  const maxKp = Math.max(...sameDay.map((r) => r.kp));
  const notable = maxKp >= KP_NOTABLE_THRESHOLD;

  return {
    for_date: forDate,
    category: 'aurora',
    title: notable ? `Aurores possibles (Kp ${maxKp})` : `Kp prévu ${maxKp}`,
    detail: {
      kp_max: maxKp,
      threshold: KP_NOTABLE_THRESHOLD,
      hours_utc: sameDay.map((r) => ({ time: r.timeTag, kp: r.kp })),
    },
    notable,
    propice_a: notable ? 'guetter les aurores au nord après le crépuscule astronomique' : null,
    source: 'noaa-swpc',
  };
}
