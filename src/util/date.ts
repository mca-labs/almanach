// Toutes les dates de stockage utilisent le fuseau de l'observateur.
export const LOCAL_TZ = 'America/Toronto';

/** YYYY-MM-DD dans le fuseau local, avec offset de jours optionnel. */
export function localDate(d: Date = new Date(), offsetDays = 0): string {
  const t = new Date(d.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LOCAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(t);
}

/** Convertit "YYYY-MM-DD" en Date positionnée à minuit local. */
export function localMidnight(yyyyMmDd: string): Date {
  // Astuce : on construit avec l'offset courant du fuseau local pour cette date.
  // Plus simple et exact que de calculer DST manuellement.
  const naive = new Date(`${yyyyMmDd}T00:00:00`);
  const tzPart = new Intl.DateTimeFormat('en-US', {
    timeZone: LOCAL_TZ,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(naive)
    .find((p) => p.type === 'timeZoneName')?.value;
  const sign = tzPart?.includes('-') ? '-' : '+';
  const hours = Number(tzPart?.match(/\d+/)?.[0] ?? 5);
  return new Date(`${yyyyMmDd}T00:00:00${sign}${String(hours).padStart(2, '0')}:00`);
}
