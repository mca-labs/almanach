// Lecture de almanach.config.json au build time, pour que l'identité du lieu
// (nom, mention, liens de sources, fuseau) ne soit pas écrite en dur dans les
// composants.
//
// Même résolution de chemin que data.ts : depuis process.cwd(), parce que
// `astro build --root site` est toujours lancé depuis la racine du dépôt. On
// évite import.meta.url, qui se déplace au bundling d'Astro 6.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AlmanachConfig {
  instance: {
    name: string;
    place: string;
    author: string;
    author_url: string;
    repo_url: string;
  };
  location: {
    latitude: number;
    longitude: number;
    elevation_m: number;
    timezone: string;
  };
  sources: {
    tempest_station_id: string;
    birdweather_station_id: string;
  };
}

const CONFIG_PATH = resolve(process.cwd(), 'almanach.config.json');

export const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as AlmanachConfig;

/** Page publique de la station météo, dérivée de son identifiant. */
export const tempestUrl = `https://tempestwx.com/station/${config.sources.tempest_station_id}/`;

/** Page publique de la station BirdWeather, dérivée de son identifiant. */
export const birdweatherUrl = `https://app.birdweather.com/stations/${config.sources.birdweather_station_id}`;
