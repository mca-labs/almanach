import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. See .env.example.');
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
