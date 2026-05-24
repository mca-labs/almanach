import { sql } from './db/client.js';

type Command = 'ingest' | 'almanac' | 'synthesize' | 'publish' | 'daily';

interface CliOptions {
  date?: string;
  source?: string;
}

function parseArgs(argv: string[]): { command: Command; options: CliOptions } {
  const [, , raw, ...rest] = argv;
  const valid: readonly Command[] = ['ingest', 'almanac', 'synthesize', 'publish', 'daily'];
  if (!raw || !valid.includes(raw as Command)) {
    console.error(`Usage: tsx src/cli.ts <${valid.join('|')}> [--date YYYY-MM-DD] [--source NAME]`);
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
    }
  }
  return { command: raw as Command, options };
}

async function runIngest(_opts: CliOptions): Promise<void> {
  // TODO: route to tempest / birdweather modules.
  console.log('ingest: not yet wired (next commit).');
}

async function runAlmanac(_opts: CliOptions): Promise<void> {
  // TODO: call almanac.computeForDate(date).
  console.log('almanac: not yet wired (next commit).');
}

async function runSynthesize(_opts: CliOptions): Promise<void> {
  // TODO: call synthesize.forDate(date).
  console.log('synthesize: not yet wired (next commit).');
}

async function runPublish(_opts: CliOptions): Promise<void> {
  // TODO: flip journal_entries.status → 'published' + trigger SITE_DEPLOY_HOOK_URL.
  console.log('publish: not yet wired (next commit).');
}

async function runDaily(opts: CliOptions): Promise<void> {
  // The orchestrator wires the four steps in order.
  await runIngest(opts);
  await runAlmanac(opts);
  await runSynthesize(opts);
  await runPublish(opts);
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
      await runDaily(options);
      break;
  }
}

main()
  .then(() => sql.end())
  .catch((err: unknown) => {
    console.error(err);
    void sql.end();
    process.exit(1);
  });
