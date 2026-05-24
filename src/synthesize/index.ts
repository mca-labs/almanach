import Anthropic from '@anthropic-ai/sdk';

import { sql } from '../db/client.js';
import { buildContext } from './context.js';
import { loadVoicePrompt, RESPONSE_FORMAT_INSTRUCTIONS } from './prompt.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;

interface SynthesisResult {
  title: string | null;
  summary: string;
  body_md: string;
  theme_tags: string[];
  highlights: {
    weather: unknown;
    bird_of_the_day: unknown;
    sky: unknown;
  };
  fragment_quote_id: string | null;
}

function getClient(): Anthropic {
  // Le SDK lit ANTHROPIC_API_KEY de l'env automatiquement.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  return new Anthropic();
}

function extractJson(text: string): SynthesisResult {
  // Le prompt impose JSON pur, mais on tolère un éventuel fence par sécurité.
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`Synthesize: réponse non-JSON : ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as SynthesisResult;
}

export async function synthesizeForDate(forDate: string): Promise<SynthesisResult> {
  const [voice, context] = await Promise.all([loadVoicePrompt(), buildContext(forDate)]);
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      // Cache : la voix change rarement, le contexte par-jour ne se cache pas.
      { type: 'text', text: voice, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: RESPONSE_FORMAT_INSTRUCTIONS },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Voici les données vérifiées pour la date ${forDate} ` +
              `(verbatim de la BD, ne pas réinterpréter) :\n\n` +
              JSON.stringify(context, null, 2),
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Synthesize: réponse sans bloc texte.');
  }
  const parsed = extractJson(textBlock.text);

  await persistJournalEntry(forDate, parsed);
  return parsed;
}

async function persistJournalEntry(forDate: string, r: SynthesisResult): Promise<void> {
  await sql`
    insert into journal_entries
      (entry_date, title, summary, body_md, highlights, status, generated_at)
    values (
      ${forDate}::date,
      ${r.title},
      ${r.summary},
      ${r.body_md},
      ${JSON.stringify({ ...r.highlights, theme_tags: r.theme_tags, fragment_quote_id: r.fragment_quote_id })}::jsonb,
      'draft',
      now()
    )
    on conflict (entry_date) do update set
      title = excluded.title,
      summary = excluded.summary,
      body_md = excluded.body_md,
      highlights = excluded.highlights,
      generated_at = excluded.generated_at,
      status = 'draft'
  `;
  console.log(`synthesize: journal_entries upserted for ${forDate}`);
}
