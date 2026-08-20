// Configuration d'instance, lue une fois au démarrage depuis almanach.config.json
// à la racine du dépôt. Contient ce qui change d'un lieu à l'autre et qui n'est
// pas un secret ; les jetons restent en variables d'environnement.
//
// Précédence : variable d'environnement > almanach.config.json. Ça garde le
// comportement actuel (les secrets GitHub Actions continuent de primer) tout en
// permettant à une instance clonée de ne rien mettre en environnement sauf ses
// jetons.
//
// Lecture synchrone assumée : quelques centaines d'octets au boot, ce qui évite
// d'imposer un `await` de haut niveau aux modules qui en dépendent (almanac.ts
// construit son Observer à l'initialisation).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  prompts: {
    rules: string;
    voice: string;
  };
}

const CONFIG_PATH = join(process.cwd(), 'almanach.config.json');

function load(): AlmanachConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `almanach.config.json introuvable à ${CONFIG_PATH}. ` +
          `Les commandes se lancent depuis la racine du dépôt.`,
      );
    }
    throw err;
  }
  return JSON.parse(raw) as AlmanachConfig;
}

export const config = load();

// Le fuseau est une propriété du lieu, pas de la machine. On le pose depuis la
// config sauf si l'environnement l'impose déjà (le workflow et Netlify le font).
process.env.TZ ??= config.location.timezone;

/** Valeur d'environnement si définie et non vide, sinon la valeur de config. */
export function envOr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

/** Idem, pour un nombre. Lève si l'environnement contient autre chose qu'un nombre. */
export function envOrNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`${name} is not a number: ${raw}`);
  return n;
}
