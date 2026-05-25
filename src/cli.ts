import { runDaily } from './daily.js';

const dateIdx = process.argv.indexOf('--date');
const date = dateIdx >= 0 ? process.argv[dateIdx + 1] : undefined;

(async () => {
  try {
    await runDaily(date ? { date } : {});
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
