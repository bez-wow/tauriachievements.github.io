import { describe, expect, it } from 'vitest';
import { formatCharacterAge, getCharacterAgeParts } from './character-age';

const day = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

describe('character age', () => {
  it('borrows days and months like a calendar', () => {
    expect(getCharacterAgeParts(day('2020-10-20'), day('2022-02-15'))).toEqual({ years: 1, months: 3, days: 26 });
  });

  it('never produces negative days across a short month', () => {
    // The old string-based calculation turned this into "0 years 1 months -2 days".
    expect(getCharacterAgeParts(day('2021-01-31'), day('2021-03-01'))).toEqual({ years: 0, months: 1, days: 1 });
  });

  it('is zero when the start is not before the end', () => {
    expect(getCharacterAgeParts(day('2026-08-12'), day('2026-08-11'))).toEqual({ years: 0, months: 0, days: 0 });
  });

  it('formats without zero-value parts and with singular labels', () => {
    expect(formatCharacterAge(day('2010-01-01'), day('2026-01-11'))).toBe('16 years 10 days');
    expect(formatCharacterAge(day('2018-01-01'), day('2026-05-01'))).toBe('8 years 4 months');
    expect(formatCharacterAge(day('2020-01-01'), day('2021-02-02'))).toBe('1 year 1 month 1 day');
  });

  it('keeps ageing after the scan instead of freezing at scan time', () => {
    const level10 = day('2025-01-01');

    expect(formatCharacterAge(level10, day('2025-01-11'))).toBe('10 days');
    expect(formatCharacterAge(level10, day('2025-02-11'))).toBe('1 month 10 days');
  });

  it('is empty when the date is unknown', () => {
    expect(formatCharacterAge(0)).toBe('');
  });
});
