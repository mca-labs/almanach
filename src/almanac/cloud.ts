// Open-Meteo — couverture nuageuse uniquement (pas de clé requise).
// Sert à tempérer le « propice à quoi » : un beau ciel à observer ne sert
// à rien sous une couche de stratus. Pas utilisé pour la météo : Tempest
// est la source canonique des mesures (§9.1).

import { OBSERVER } from './observer.js';

function base(): string {
  return process.env.OPENMETEO_BASE ?? 'https://api.open-meteo.com/v1';
}

interface OpenMeteoForecast {
  hourly: {
    time: string[];
    cloud_cover: number[];
  };
}

/** Retourne la couverture nuageuse moyenne (%) pour la fenêtre nocturne locale du `forDate`. */
export async function nightCloudCover(forDate: string): Promise<number | null> {
  const url =
    `${base()}/forecast?latitude=${OBSERVER.latitude}&longitude=${OBSERVER.longitude}` +
    `&hourly=cloud_cover&start_date=${forDate}&end_date=${forDate}` +
    `&timezone=America/Toronto`;
  let data: OpenMeteoForecast;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    data = (await res.json()) as OpenMeteoForecast;
  } catch (err) {
    console.warn('cloud: fetch failed, omitting', err);
    return null;
  }
  // Fenêtre nocturne approximative : 20 h → 04 h local. On agrège les heures
  // 20..23 du jour donné (l'API renvoie aussi 00..04 mais sur la date suivante).
  const nightIdx = data.hourly.time
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => {
      const hour = Number(t.split('T')[1]!.slice(0, 2));
      return hour >= 20 || hour <= 4;
    })
    .map(({ i }) => i);
  if (nightIdx.length === 0) return null;
  const vals = nightIdx.map((i) => data.hourly.cloud_cover[i]!).filter((v) => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
