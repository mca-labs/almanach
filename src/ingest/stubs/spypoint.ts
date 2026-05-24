// Source future : caméra de chasse Spypoint. Cf. docs/spec.md §11.
// Conteneur Railway dédié (API non officielle). Chaque photo → vision Claude
// pour identification, puis JETÉE — règle « identifier puis jeter ». La
// galerie d'espèces utilisera des images de référence externes.

import type { RawObservation, SourceModule } from '../types.js';

export const spypointModule: SourceModule = {
  name: 'spypoint',
  ingest: async (_since: Date): Promise<RawObservation[]> => {
    throw new Error('spypoint: non implémenté en v1 (cf. docs/spec.md §11).');
  },
};
