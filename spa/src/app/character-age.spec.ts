import { describe, expect, it } from 'vitest';
import { formatCharacterAge, parseCharacterAge } from './character-age';

describe('character age helpers', () => {
  it('parses years, months, and days from a character age string', () => {
    expect(parseCharacterAge('16 years 4 months 5 days')).toEqual({
      years: 16,
      months: 4,
      days: 5
    });
  });

  it('formats character age without zero-value month or day parts', () => {
    expect(formatCharacterAge('16 years 0 months 10 days')).toBe('16 years 10 days');
    expect(formatCharacterAge('8 years 4 months 0 days')).toBe('8 years 4 months');
  });

  it('uses singular labels for one-value age parts', () => {
    expect(formatCharacterAge('1 years 1 months 1 days')).toBe('1 year 1 month 1 day');
  });
});
