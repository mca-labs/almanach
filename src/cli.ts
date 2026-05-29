import { runDaily } from './daily.js';

const dateIdx = process.argv.indexOf('--date');
const date = dateIdx >= 0 ? process.argv[dateIdx + 1] : undefined;
const force = process.argv.includes('--force');

// Valide le format AVANT toute utilisation : `date` sert à construire des chemins
// de fichiers (data/.../${date}.json). Une valeur non contrôlée permettrait une
// traversée de chemin (ex. ../../). On n'accepte que YYYY-MM-DD.
if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`--date invalide : attendu YYYY-MM-DD.`);
  process.exit(1);
}

(async () => {
  try {
    await runDaily({ ...(date ? { date } : {}), force });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
