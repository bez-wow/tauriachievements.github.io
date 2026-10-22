import { describe, expect, it } from 'vitest';
import {
  formatAgo,
  formatAmount,
  formatFightTime,
  formatPerSecond,
  nameMatches,
  parseRoleFilter,
  raidLogLink
} from './raid-display';

describe('parseRoleFilter', () => {
  it('reads ?role=, falling back to every role', () => {
    expect(['tank', 'healer', 'dps', 'heal', null].map(parseRoleFilter))
      .toEqual(['tank', 'healer', 'dps', 'all', 'all']);
  });
});

describe('formatting', () => {
  it('formats fight times, per-second figures and totals', () => {
    expect(formatFightTime(296_400)).toBe('4:56');
    expect(formatFightTime(3_725_000)).toBe('1:02:05');
    expect(formatPerSecond(754_644)).toBe('754.6k');
    expect(formatPerSecond(1_236_000)).toBe('1.24M');
    expect(formatPerSecond(999)).toBe('999');
    expect(formatAmount(63_030_057)).toBe('63.0M');
    expect(formatAmount(2_740_000_000)).toBe('2.74B');
  });

  it('says how long ago', () => {
    const now = Date.UTC(2026, 9, 12, 12);
    expect(formatAgo(now - 30_000, now)).toBe('just now');
    expect(formatAgo(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(formatAgo(now - 5 * 3_600_000, now)).toBe('5 h ago');
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe('3 d ago');
  });

  it('finds names without regard to case or accents', () => {
    expect(nameMatches('Sósa', 'sosa')).toBe(true);
    expect(nameMatches('Ørna', 'rna')).toBe(true);
    expect(nameMatches('Kael', 'x')).toBe(false);
    expect(nameMatches('Kael', '  ')).toBe(true);
  });

  it('links a log by its realm and id', () => {
    expect(raidLogLink({ realm: 'WoD', logId: 283007 })).toEqual(['/raid-logs', 'log', 'wod', 283007]);
  });
});
