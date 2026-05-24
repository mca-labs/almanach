import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from './client.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    create table if not exists _migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `;
}

async function appliedSet(): Promise<Set<string>> {
  const rows = await sql<{ name: string }[]>`select name from _migrations`;
  return new Set(rows.map((r) => r.name));
}

async function listMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

async function applyMigration(name: string): Promise<void> {
  const body = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into _migrations (name) values (${name})`;
  });
}

export async function migrate(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedSet();
  const all = await listMigrations();
  const pending = all.filter((n) => !applied.has(n));

  if (pending.length === 0) {
    console.log('migrate: no pending migrations.');
    return;
  }

  for (const name of pending) {
    console.log(`migrate: applying ${name}`);
    await applyMigration(name);
  }
  console.log(`migrate: ${pending.length} applied.`);
}

const isEntrypoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntrypoint) {
  migrate()
    .then(() => sql.end())
    .catch((err: unknown) => {
      console.error(err);
      void sql.end();
      process.exit(1);
    });
}
