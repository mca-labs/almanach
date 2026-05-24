// Charge le prompt de voix éditoriale à chaque appel.
// Le spec §7 + le fichier prompts/editorial-voice.md précisent qu'on
// recharge à chaque exécution : modifier le fichier, pas le code.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const VOICE_PATH = join(process.cwd(), 'prompts', 'editorial-voice.md');

export async function loadVoicePrompt(): Promise<string> {
  return await readFile(VOICE_PATH, 'utf8');
}

export const RESPONSE_FORMAT_INSTRUCTIONS = `
Tu réponds UNIQUEMENT par un objet JSON valide, sans backticks ni texte autour. Schéma :

{
  "title": string | null,           // titre court éditorial, optionnel
  "summary": string,                // ligne de condition (une phrase, présent)
  "body_md": string,                // le billet — exactement 2 paragraphes séparés par une ligne vide
  "theme_tags": string[],           // ex. ["migration", "silence"]
  "highlights": {                   // faits saillants STRUCTURÉS (verbatim des données fournies)
    "weather": object | null,
    "bird_of_the_day": object | null,
    "sky": object | null
  },
  "fragment_quote_id": string | null  // id (uuid) d'une citation de la liste fournie, ou null
}

Règles non négociables (cf. prompts/editorial-voice.md) :
- N'invente AUCUNE donnée : si une mesure ou une espèce manque dans l'entrée, ne la mentionne pas.
- N'attribue jamais une citation à un auteur dans le billet — la citation va dans le fragment, séparément, sélectionnée depuis la liste fournie.
- Si aucune citation de la liste ne convient au thème, retourne fragment_quote_id = null.
`.trim();
