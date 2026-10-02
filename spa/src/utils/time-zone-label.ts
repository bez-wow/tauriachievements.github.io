/**
 * The short name of the browser's time zone at `date` (e.g. "CEST", "GMT+2"), for showing
 * next to a time rendered in local time. Falls back to "Local time" when it can't be read.
 */
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
