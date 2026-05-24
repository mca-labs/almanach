// Source future : connecteur API eBird. Cf. docs/spec.md §11.
// Distinct du PUC passif BirdWeather : sert aux « sorties actives » et
// alimentera la base de fréquence régionale (pour calculer la rareté).

import type { RawObservation, SourceModule } from '../types.js';

export const ebirdModule: SourceModule = {
  name: 'ebird',
  ingest: async (_since: Date): Promise<RawObservation[]> => {
    throw new Error('ebird: non implémenté en v1 (cf. docs/spec.md §11).');
  },
};
