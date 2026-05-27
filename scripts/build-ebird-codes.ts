/**
 * Script one-shot : télécharge la taxonomy eBird publique (sans clé) et génère
 * data/ebird-species-codes.json avec un mapping minimal { taxon_scientific: species_code }.
 *
 * Utilisé pour les liens « fiche eBird » sur les noms d'oiseaux du site.
 * Re-lancer une fois par an environ (eBird publie une nouvelle taxonomy en octobre).
 *
 * Usage : node --import tsx scripts/build-ebird-codes.ts
 */

import { writeFile } from 'node:fs/promises';

const TAXONOMY_URL = 'https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&locale=fr';
const OUTPUT = 'data/ebird-species-codes.json';

interface TaxonRow {
  SCIENTIFIC_NAME: string;
  COMMON_NAME: string;
  SPECIES_CODE: string;
  CATEGORY: string;
}

/**
 * Parseur CSV minimal qui gère les champs entre guillemets (les noms communs
 * français peuvent contenir des virgules, ex. « Garrot d'Islande, » serait
 * problématique sans gestion des quotes). Pas de support pour les guillemets
 * échappés dans les champs (rare dans cette taxonomy).
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function main(): Promise<void> {
  console.log(`Téléchargement de la taxonomy eBird…`);
  const res = await fetch(TAXONOMY_URL);
  if (!res.ok) throw new Error(`eBird HTTP ${res.status}`);
  const csv = await res.text();
  console.log(`  ${(csv.length / 1024 / 1024).toFixed(2)} MB téléchargés`);

  const lines = csv.split('\n');
  const header = parseCSVLine(lines[0]!);
  const idx = {
    sci: header.indexOf('SCIENTIFIC_NAME'),
    common: header.indexOf('COMMON_NAME'),
    code: header.indexOf('SPECIES_CODE'),
    category: header.indexOf('CATEGORY'),
  };
  if (idx.sci < 0 || idx.code < 0 || idx.category < 0) {
    throw new Error(`En-têtes CSV inattendus : ${header.join(', ')}`);
  }

  const mapping: Record<string, string> = {};
  let speciesCount = 0;
  let skipped = 0;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const fields = parseCSVLine(line);
    if (fields[idx.category] !== 'species') {
      skipped++;
      continue;
    }
    const sci = fields[idx.sci]!.trim();
    const code = fields[idx.code]!.trim();
    if (sci && code) {
      mapping[sci] = code;
      speciesCount++;
    }
  }

  console.log(`  ${speciesCount} species retenues, ${skipped} entrées non-species ignorées`);
  await writeFile(OUTPUT, JSON.stringify(mapping, null, 0) + '\n', 'utf8');
  console.log(`✓ ${OUTPUT} écrit (${(JSON.stringify(mapping).length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
