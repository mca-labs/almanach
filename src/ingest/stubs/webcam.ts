// Source future : webcam jardin / serre — Raspberry Pi + caméra + cron.
// Une photo/jour à heure fixe ; affichage de la « dernière » uniquement.
// Cf. docs/spec.md §11. Seule source où conserver une série (timelapse de
// croissance) peut se justifier — à trancher en §13.

import type { RawObservation, SourceModule } from '../types.js';

export const webcamModule: SourceModule = {
  name: 'webcam',
  ingest: async (_since: Date): Promise<RawObservation[]> => {
    throw new Error('webcam: non implémenté en v1 (cf. docs/spec.md §11).');
  },
};
