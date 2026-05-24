import postgres from 'postgres';

// Lecture seule au build time. Si DATABASE_URL est absente (ex. dev sans BD),
// on renvoie un sql() qui throw — c'est aux requêtes de gérer leur fallback.

let _sql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set — la BD est requise au build du site.');
  }
  _sql = postgres(url, {
    ssl: url.includes('localhost') ? false : 'prefer',
    max: 4,
    idle_timeout: 30,
    connection: { application_name: 'almanach-site' },
  });
  return _sql;
}

export async function closeSql(): Promise<void> {
  if (_sql) {
    await _sql.end({ timeout: 5 });
    _sql = null;
  }
}
