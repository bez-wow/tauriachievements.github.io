import { describe, expect, it } from 'vitest';
import { formatDonation, quoteSpans } from './support';

describe('formatDonation', () => {
  it('writes money with its symbol, and cents only when there are some', () => {
    expect(formatDonation({ names: [{ name: 'A' }], amount: 50, currency: 'eur' })).toBe('€50');
    expect(formatDonation({ names: [{ name: 'A' }], amount: 12.5, currency: 'usd' })).toBe('$12.50');
    expect(formatDonation({ names: [{ name: 'A' }], amount: 1500, currency: 'eur' })).toBe('€1,500');
  });

  it('writes in-game currency as a grouped count and its name', () => {
    expect(formatDonation({ names: [{ name: 'A' }], amount: 100_000, currency: 'gold' })).toBe('100,000 gold');
    expect(formatDonation({ names: [{ name: 'A' }], amount: 500, currency: 'credits' })).toBe('500 Tauri Credits');
  });
});

describe('quoteSpans', () => {
  const short = 'x'.repeat(20);
  const regular = 'x'.repeat(100);
  const long = 'x'.repeat(200);

  it('puts one-liners three to a row, regular quotes two, and long ones alone', () => {
    expect(quoteSpans([short, short, short, regular, regular, long])).toEqual([2, 2, 2, 3, 3, 6]);
  });

  it('fills the gap a long quote leaves, as the dense grid does', () => {
    expect(quoteSpans([regular, long, regular])).toEqual([3, 6, 3]);
  });

  it('widens the last quote of a row that would otherwise have a gap', () => {
    expect(quoteSpans([regular, short, regular])).toEqual([3, 3, 6]);
    expect(quoteSpans([short, short, short, short])).toEqual([2, 2, 2, 6]);
  });
});
