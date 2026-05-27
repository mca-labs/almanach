import { runDaily } from './daily.js';

const dateIdx = process.argv.indexOf('--date');
const date = dateIdx >= 0 ? process.argv[dateIdx + 1] : undefined;
const force = process.argv.includes('--force');

(async () => {
  try {
    await runDaily({ ...(date ? { date } : {}), force });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
