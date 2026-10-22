import { describe, it, expect } from 'vitest';
import { formatPlayedTime, formatSignedPlayedTime } from './played-time';

describe('formatPlayedTime', () => {
  it('formats zero and invalid values as minutes', () => {
    expect(formatPlayedTime(0)).toBe('0m');
    expect(formatPlayedTime(undefined)).toBe('0m');
    expect(formatPlayedTime(-50)).toBe('0m');
  });

  it('formats sub-hour values as minutes', () => {
    expect(formatPlayedTime(59)).toBe('0m');
    expect(formatPlayedTime(60)).toBe('1m');
    expect(formatPlayedTime(45 * 60)).toBe('45m');
  });

  it('formats sub-day values as hours and minutes', () => {
    expect(formatPlayedTime(3600)).toBe('1h 0m');
    expect(formatPlayedTime(7 * 3600 + 32 * 60)).toBe('7h 32m');
  });

  it('formats values of a day or more as days, hours, and minutes', () => {
    expect(formatPlayedTime(86400)).toBe('1d 0h 0m');
    expect(formatPlayedTime(310 * 86400 + 13 * 3600 + 18 * 60)).toBe('310d 13h 18m');
  });
});

describe('formatSignedPlayedTime', () => {
  it('formats a zero delta without a sign', () => {
    expect(formatSignedPlayedTime(0)).toBe('0m');
  });

  it('prefixes positive deltas with a plus sign', () => {
    expect(formatSignedPlayedTime(2 * 3600 + 15 * 60)).toBe('+2h 15m');
  });

  it('prefixes negative deltas with a minus sign', () => {
    expect(formatSignedPlayedTime(-(3 * 86400 + 4 * 3600))).toBe('-3d 4h 0m');
  });
});
