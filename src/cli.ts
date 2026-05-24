import { persistSkyEvents } from './almanac/index.js';
import { sql } from './db/client.js';
import { birdweatherModule } from './ingest/birdweather/index.js';
import { tempestModule } from './ingest/tempest/index.js';
import { runDaily } from './orchestrator/daily.js';
import { synthesizeForDate } from './synthesize/index.js';

type Command = 'ingest' | 'almanac' | 'synthesize' | 'publish' | 'daily';

interface CliOptions {
  date?: string;
  source?: string;
  since?: string;
}

function parseArgs(argv: string[]): { command: Command; options: CliOptions } {
  const [, , raw, ...rest] = argv;
  const valid: readonly Command[] = ['ingest', 'almanac', 'synthesize', 'publish', 'daily'];
  if (!raw || !valid.includes(raw as Command)) {
    console.error(
      `Usage: tsx src/cli.ts <${valid.join('|')}> ` +
        `[--date YYYY-MM-DD] [--source tempest|birdweather] [--since YYYY-MM-DD]`,
    );
    process.exit(2);
  }
  const options: CliOptions = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = rest[i + 1];
    if (arg === '--date' && next) {
      options.date = next;
      i++;
    } else if (arg === '--source' && next) {
      options.source = next;
      i++;
    } else if (arg === '--since' && next) {
      options.since = next;
      i++;
    }
  }
  return { command: raw as Command, options };
}

function defaultSince(opts: CliOptions): Date {
  if (opts.since) return new Date(`${opts.since}T00:00:00Z`);
  return new Date(Date.now() - 2 * 86400000); // 48 h de marge
}

async function runIngest(opts: CliOptions): Promise<void> {
  const since = defaultSince(opts);
  if (!opts.source || opts.source === 'tempest') {
    await tempestModule.ingest(since);
  }
  if (!opts.source || opts.source === 'birdweather') {
    await birdweatherModule.ingest(since);
  }
}

async function runAlmanac(opts: CliOptions): Promise<void> {
  const forDate = opts.date ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await persistSkyEvents(forDate);
}

async function runSynthesize(opts: CliOptions): Promise<void> {
  if (!opts.date) {
    console.error('synthesize : --date YYYY-MM-DD requis');
    process.exit(2);
  }
  await synthesizeForDate(opts.date);
}

async function runPublish(opts: CliOptions): Promise<void> {
  if (!opts.date) {
    console.error('publish : --date YYYY-MM-DD requis');
    process.exit(2);
  }
  const rows = await sql<{ id: string }[]>`
    update journal_entries
       set status = 'published', published_at = now()
     where entry_date = ${opts.date}::date and status = 'draft'
     returning id
  `;
  console.log(`publish: ${rows.length} entrée(s) publiée(s).`);
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv);
  switch (command) {
    case 'ingest':
      await runIngest(options);
      break;
    case 'almanac':
      await runAlmanac(options);
      break;
    case 'synthesize':
      await runSynthesize(options);
      break;
    case 'publish':
      await runPublish(options);
      break;
    case 'daily':
      await runDaily(options.date ? { date: options.date } : {});
      break;
  }
}

// SORTIE PROPRE (critique pour le cron Railway) : on ferme explicitement
// le pool Postgres, puis process.exit(0). Un handle ouvert (socket
// keepalive, pool inactif, promesse non awaited) garderait le process en
// vie et la run cron suivante serait sautée silencieusement.
(async () => {
  try {
    await main();
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    console.error(err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
})();
