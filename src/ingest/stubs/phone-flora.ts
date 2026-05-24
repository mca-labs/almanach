// Source future : photos de flore depuis le téléphone, GPS EXIF.
// Cf. docs/spec.md §11. Identification via Claude (option Pl@ntNet à
// confirmer), photos non archivées sauf la « dernière capture ».

import type { RawObservation, SourceModule } from '../types.js';

export const phoneFloraModule: SourceModule = {
  name: 'phone_flora',
  ingest: async (_since: Date): Promise<RawObservation[]> => {
    throw new Error('phone_flora: non implémenté en v1 (cf. docs/spec.md §11).');
  },
};
