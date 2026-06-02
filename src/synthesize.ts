// Synthèse du billet via Claude. Lit prompts/editorial-voice.md à chaque
// appel pour qu'un ajustement de voix ne nécessite pas de redéploiement.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import Anthropic from '@anthropic-ai/sdk';

import type { WeatherDaily } from './sources/tempest.js';
import type { BirdsDaily, BirdDetectionRow } from './sources/birdweather.js';
import type { SkyDaily } from './almanac.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const VOICE_PATH = join(process.cwd(), 'prompts', 'editorial-voice.md');

export interface Quote {
  id: string;
  text: string;
  author: string;
  work: string;
  year: number;
  theme_tags: string[];
  /** Langue de la citation source : "fr" ou "en" (et autres à venir).
   *  Si "fr", Claude ne génère pas de fragment_translation_fr. */
  lang: 'fr' | 'en';
}

export interface SynthesisContext {
  date: string;          // entry_date (la veille)
  sky_date: string;      // typiquement entry_date + 1
  weather: WeatherDaily | null;
  birds: BirdsDaily;
  sky: SkyDaily;
  quotes_available: Quote[];
}

export interface SynthesisResult {
  title: string | null;
  summary: string;
  body_md: string;
  sky_narrative: string;
  theme_tags: string[];
  highlights: {
    weather: unknown;
    bird_of_the_day: BirdDetectionRow | null;
    sky: unknown;
  };
  fragment_quote_id: string | null;
  /** Traduction française de la citation choisie si elle n'est pas en français.
   *  null si le texte original est déjà en français. */
  fragment_translation_fr: string | null;
}

const RESPONSE_FORMAT = `
Tu réponds UNIQUEMENT par un objet JSON valide, sans backticks ni texte autour. Schéma :

{
  "title": string | null,
  "summary": string,
  "body_md": string,
  "sky_narrative": string,
  "theme_tags": string[],
  "highlights": {
    "weather": object | null,
    "bird_of_the_day": object | null,
    "sky": object | null
  },
  "fragment_quote_id": string | null,
  "fragment_translation_fr": string | null
}

Règles de FORMAT strictes (impératives) :
- "summary" = la ligne de condition, UNE seule phrase, au présent. C'est le seul endroit où elle apparaît.
- "body_md" = LE BILLET, exactement deux paragraphes en prose pure, séparés par une ligne vide (\\n\\n).
- "sky_narrative" = UNE ou DEUX phrases (40-90 mots) au FUTUR décrivant la nuit qui s'ouvre. C'est une nuit À VENIR du point de vue du lecteur (qui lit le matin) : tous les verbes principaux au futur simple ou au présent à valeur de futur. JAMAIS d'imparfait, JAMAIS de passé composé pour des événements postérieurs au moment de la lecture. Écrire « la lune se couchera à 2 h 26 », PAS « la lune s'est couchée à 2 h 26 ». Écrire « Vénus et Jupiter brilleront » ou « seront visibles », PAS « brillaient » ni « étaient visibles ». Ancré dans les données de "sky" fournies : phase de Lune et son heure de coucher, planètes notables, couverture nuageuse, durée d'obscurité réelle. Style identique au billet, mais centré sur le ciel. Indique concrètement à quoi la nuit se prête (ex. observation lunaire, ciel profond, marche sans frontale) ou à quoi elle ne se prête pas.
- "fragment_translation_fr" = traduction française fidèle et littéraire du "text" de la citation choisie via fragment_quote_id. RENVOIE null si la citation source est déjà en français (le champ "lang" de la citation vaut "fr"). La traduction respecte le sens, le rythme et le registre de l'original ; pas de paraphrase, pas d'embellissement.

Italiques dans la prose ("body_md" et "sky_narrative") :
- Le SEUL balisage autorisé est l'italique des NOMS SCIENTIFIQUES LATINS (binôme genre + espèce, ex. *Setophaga coronata*), entourés d'astérisques simples.
- AUCUN autre astérisque/underscore/balisage. Pas d'italique sur des mots français, pas de gras nulle part, pas de label de section ("*Condition*", "*Billet*").
- "body_md" NE doit JAMAIS contenir :
  • le label « Condition », « *Condition* », « Billet », « *Billet* », ni aucun autre marqueur de section ;
  • la ligne de condition (elle est déjà dans "summary", ne la répète pas) ;
  • d'astérisques, d'underscores, de gras, d'italique markdown ou tout autre balisage ;
  • d'attribution de citation à un auteur (la citation est posée séparément via "fragment_quote_id").
- Les noms latins d'espèces doivent rester en texte simple, sans italique markdown.

Règles de CONTENU non négociables (cf. prompts/editorial-voice.md) :
- N'invente AUCUNE donnée. Si une mesure ou une espèce manque, ne la mentionne pas.
- Si aucune citation de la liste ne convient au thème, retourne fragment_quote_id = null.
`.trim();

function extractJson(text: string): SynthesisResult {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`synthesize: non-JSON response: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as SynthesisResult;
}

/**
 * Réessaie un appel API sur erreur transitoire (429 rate-limit, 529 overloaded,
 * 5xx) avec un long backoff. Le run quotidien a des heures de marge : mieux vaut
 * attendre qu'une surcharge passagère d'Anthropic se résorbe que de planter tout
 * le run (et perdre l'édition du jour) sur un seul 529.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  const delays = [30_000, 60_000, 120_000, 300_000]; // 30 s, 1, 2, 5 min
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      const retryable = status === 429 || status === 529 || (typeof status === 'number' && status >= 500);
      if (!retryable || i >= attempts - 1) throw err;
      const wait = delays[Math.min(i, delays.length - 1)]!;
      console.warn(`synthesize: API ${status} — réessai ${i + 1}/${attempts - 1} dans ${wait / 1000} s…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export async function synthesize(ctx: SynthesisContext): Promise<SynthesisResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set.');
  }
  const voice = await readFile(VOICE_PATH, 'utf8');
  const client = new Anthropic();

  const response = await withRetry(() => client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: voice, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: RESPONSE_FORMAT },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Voici les données vérifiées pour la date ${ctx.date} (verbatim, ne pas réinterpréter) :\n\n` +
              JSON.stringify(
                {
                  date: ctx.date,
                  sky_date: ctx.sky_date,
                  weather: ctx.weather,
                  birds: ctx.birds,
                  sky: ctx.sky,
                  quotes_available: ctx.quotes_available,
                },
                null,
                2,
              ),
          },
        ],
      },
    ],
  }));

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    throw new Error('synthesize: response had no text block.');
  }
  return extractJson(block.text);
}
