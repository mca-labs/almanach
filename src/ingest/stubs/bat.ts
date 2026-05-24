// Source future : BattyBirdNET-Pi. Cf. docs/spec.md §11.
// RasPi + micro ultrason ; pousse birds.db + enregistrements via rclone.
// Licence CC BY-NC-SA : OK projet perso, NON réutilisable commercialement.

import type { RawObservation, SourceModule } from '../types.js';

export const batModule: SourceModule = {
  name: 'bat',
  ingest: async (_since: Date): Promise<RawObservation[]> => {
    throw new Error('bat: non implémenté en v1 (cf. docs/spec.md §11).');
  },
};
