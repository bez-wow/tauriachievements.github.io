export function getLocalTimeZoneLabel(date: Date | undefined): string {
  if (!date) {
    return 'Local time';
  }

  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'Local time';
  } catch {
    return 'Local time';
  }
}
