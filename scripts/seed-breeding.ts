// Seed ref_breeding_calendar à partir du calendrier de l'Atlas des oiseaux
// nicheurs du Québec (atlas-oiseaux.qc.ca).
//
// Source : https://www.atlas-oiseaux.qc.ca/donneesqc/calendrier.jsp?lang=fr
// Snapshot conservé : scripts/data/atlas-breeding-source.html (audit + offline).
//
// Structure de la table HTML, pour chaque espèce :
//   <tr> ... <td rowspan=2>{nom_fr}</td><td rowspan=2 class="fwk">{code}</td>
//            (48 cellules ponte, présence = <img src="/cd1.jpg">)
//   </tr>
//   <tr> (48 cellules élevage, présence = <img src="/cd2.jpg">) </tr>
//
// Les 48 cellules représentent 4 semaines × 12 mois, indexées 1..48.
//
// Limitation v1 : la passerelle nom_fr ↔ nom_scientifique (§9.2 du spec)
// n'est pas faite ici. ref_breeding_calendar.name_scientific reste NULL,
// à brancher plus tard (croiser avec BirdWeather / iNat preferred_common_name).
//
// Usage :
//   npm run seed:breeding [--refresh]   (--refresh = re-télécharger la page)

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../src/db/client.js';

const SOURCE_URL =
  'https://www.atlas-oiseaux.qc.ca/donneesqc/calendrier.jsp?lang=fr';
const SNAPSHOT_PATH = join(process.cwd(), 'scripts', 'data', 'atlas-breeding-source.html');

interface SpeciesRow {
  code: string;
  name_fr: string;
  weeks_ponte: number[];
  weeks_elevage: number[];
}

async function getSnapshot(): Promise<string> {
  if (process.argv.includes('--refresh') || !existsSync(SNAPSHOT_PATH)) {
    console.log(`seed:breeding: téléchargement depuis ${SOURCE_URL}`);
    const res = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'almanach-val-des-loups/0.1 (+https://github.com/mca-labs/almanach)',
      },
    });
    if (!res.ok) {
      throw new Error(`Atlas HTTP ${res.status}`);
    }
    const html = await res.text();
    await writeFile(SNAPSHOT_PATH, html, 'utf8');
    return html;
  }
  return await readFile(SNAPSHOT_PATH, 'utf8');
}

/** Extrait les semaines (1..48) présentes dans un fragment ligne TR. */
function extractWeeks(rowHtml: string, marker: 'cd1' | 'cd2'): number[] {
  // Chaque cellule = <td …>…</td>. On compte la position et garde celles
  // qui contiennent l'image marker.jpg.
  const cells = rowHtml.match(/<td\b[^>]*>[\s\S]*?<\/td>/g) ?? [];
  // Pour la première ligne d'une espèce, les 2 premières cellules
  // (nom + code) sont en rowspan=2 — on les exclut.
  const cleaned = cells.filter((c) => !/rowspan=/i.test(c));
  const weeks: number[] = [];
  cleaned.forEach((cell, idx) => {
    if (cell.includes(`${marker}.jpg`)) weeks.push(idx + 1);
  });
  return weeks;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/g, '') // strip orphan named entities (eg. dagger marker)
    .trim();
}

function parse(html: string): SpeciesRow[] {
  // Récupère le bloc <table … colspan=4> jusqu'à </table>.
  // Approche : split tous les <tr…> et walker 2 par 2 quand on trouve le marker rowspan=2.
  const trChunks = html.split(/<tr\b/i).slice(1).map((c) => '<tr ' + c.split(/<\/tr>/i)[0] + '</tr>');

  const species: SpeciesRow[] = [];
  for (let i = 0; i < trChunks.length; i++) {
    const row = trChunks[i]!;
    const headerMatch = row.match(
      /<td\s+rowspan=2[^>]*>([\s\S]*?)<\/td>\s*<td\s+rowspan=2[^>]*class=["']?fwk["']?[^>]*>([\s\S]*?)<\/td>/i,
    );
    if (!headerMatch) continue;
    const name_fr = decodeHtml(headerMatch[1]!);
    const code = decodeHtml(headerMatch[2]!);
    if (!/^[A-Z]{4}$/.test(code)) continue; // code atlas = 4 majuscules
    const nextRow = trChunks[i + 1];
    if (!nextRow) continue;
    species.push({
      code,
      name_fr,
      weeks_ponte: extractWeeks(row, 'cd1'),
      weeks_elevage: extractWeeks(nextRow, 'cd2'),
    });
  }
  return species;
}

async function run(): Promise<void> {
  const html = await getSnapshot();
  const species = parse(html);
  if (species.length === 0) {
    throw new Error('seed:breeding : aucune espèce extraite — le HTML a-t-il changé ?');
  }
  console.log(`seed:breeding : ${species.length} espèces extraites.`);

  await sql.begin(async (tx) => {
    // Réinsertion propre du seed (n'écrase pas un nom_scientific
    // éventuellement défini après coup → on conserve si présent).
    for (const s of species) {
      await tx`
        insert into ref_breeding_calendar
          (code, name_fr, name_scientific, weeks_ponte, weeks_elevage)
        values
          (${s.code}, ${s.name_fr}, null, ${s.weeks_ponte}, ${s.weeks_elevage})
        on conflict (code) do update set
          name_fr        = excluded.name_fr,
          weeks_ponte    = excluded.weeks_ponte,
          weeks_elevage  = excluded.weeks_elevage
      `;
    }
  });

  // Sanity-check : quelques échantillons.
  const sample = species.slice(0, 3);
  for (const s of sample) {
    console.log(`  ${s.code} ${s.name_fr} — ponte: ${s.weeks_ponte.length} sem, élevage: ${s.weeks_elevage.length} sem`);
  }
  const total = await sql<{ n: number }[]>`select count(*)::int as n from ref_breeding_calendar`;
  console.log(`seed:breeding : ${total[0]?.n ?? 0} espèces en BD.`);
}

(async () => {
  try {
    await run();
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    console.error(err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
})();
