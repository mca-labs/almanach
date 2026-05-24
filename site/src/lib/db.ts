import postgres from 'postgres';

// Lecture seule au build time. Si DATABASE_URL est absente (ex. dev sans BD),
// on renvoie un sql() qui throw — c'est aux requêtes de gérer leur fallback.

let _sql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (_sql) return _sql;
  // Netlify Database expose NETLIFY_DATABASE_URL au build. Fallback DATABASE_URL pour le local.
  const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Neither NETLIFY_DATABASE_URL nor DATABASE_URL is set — la BD est requise au build du site.');
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
