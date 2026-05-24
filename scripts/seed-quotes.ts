// Seed initial de `ref_quotes` à partir de scripts/data/quotes.json.
// Chaque citation est vérifiable : `source_url` pointe vers le .txt
// Project Gutenberg (ou Wikiquote pour Leopold), `source_note` donne la
// ligne pour audit.
//
// Idempotence : on supprime les entrées dont (author, work) figurent dans
// le JSON puis on les ré-insère. Les ajouts manuels d'autres auteurs/œuvres
// ne sont jamais touchés.
//
// Usage : npm run seed:quotes

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from '../src/db/client.js';

interface Citation {
  text: string;
  author: string;
  work: string;
  year: number;
  theme_tags: string[];
  public_domain: boolean;
  source_url: string;
  source_note: string;
}

interface Payload {
  citations: Citation[];
}

async function run(): Promise<void> {
  const path = join(process.cwd(), 'scripts', 'data', 'quotes.json');
  const raw = await readFile(path, 'utf8');
  const payload = JSON.parse(raw) as Payload;
  const citations = payload.citations;
  if (!Array.isArray(citations) || citations.length === 0) {
    throw new Error('seed:quotes : citations vides ou mal formatées.');
  }

  // Réinsertion propre des (author, work) couverts par ce seed.
  const works = [...new Set(citations.map((c) => `${c.author}|${c.work}`))];

  await sql.begin(async (tx) => {
    for (const composite of works) {
      const [author, work] = composite.split('|') as [string, string];
      await tx`
        delete from ref_quotes where author = ${author} and work = ${work}
      `;
    }

    for (const c of citations) {
      await tx`
        insert into ref_quotes
          (text, author, work, year, theme_tags, public_domain)
        values
          (${c.text}, ${c.author}, ${c.work}, ${c.year},
           ${c.theme_tags}, ${c.public_domain})
      `;
    }
  });

  const counts = await sql<{ author: string; count: number }[]>`
    select author, count(*)::int as count
    from ref_quotes
    group by author
    order by author
  `;
  console.log('seed:quotes — par auteur :');
  for (const r of counts) {
    console.log(`  ${r.author.padEnd(28)} ${r.count}`);
  }
  const total = await sql<{ n: number }[]>`select count(*)::int as n from ref_quotes`;
  console.log(`seed:quotes : ${total[0]?.n ?? 0} citations en BD.`);
}

(async () => {
  try {
    await run();
    await sql.end({ timeout: 5 });
    process.exit(0);
  } catch (err) {
    console.error(err);
    await sql.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }
})();
