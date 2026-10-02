import { describe, expect, it } from 'vitest';
import { getLocalTimeZoneLabel } from './time-zone-label';

describe('getLocalTimeZoneLabel', () => {
  it('names the browser time zone for a date', () => {
    const date = new Date('2026-09-27T18:32:00Z');
    const expected = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value;

    expect(getLocalTimeZoneLabel(date)).toBe(expected);
  });

  it('falls back to "Local time" without a date', () => {
    expect(getLocalTimeZoneLabel(undefined)).toBe('Local time');
  });
});
