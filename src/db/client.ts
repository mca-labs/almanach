import 'dotenv/config';
import postgres from 'postgres';

// Netlify Database injecte NETLIFY_DATABASE_URL au build/runtime.
// On garde DATABASE_URL en fallback pour le dev local hors Netlify.
const url = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('Neither NETLIFY_DATABASE_URL nor DATABASE_URL is set.');
}

export const sql = postgres(url, {
  ssl: url.includes('localhost') ? false : 'prefer',
  max: 4,
  idle_timeout: 30,
  connection: {
    application_name: 'almanach',
  },
});

export type Sql = typeof sql;
