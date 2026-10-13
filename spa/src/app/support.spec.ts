import { describe, expect, it } from 'vitest';
import { formatDonation } from './support';

describe('formatDonation', () => {
  it('writes money with its symbol, and cents only when there are some', () => {
    expect(formatDonation({ name: 'A', amount: 50, currency: 'eur' })).toBe('€50');
    expect(formatDonation({ name: 'A', amount: 12.5, currency: 'usd' })).toBe('$12.50');
    expect(formatDonation({ name: 'A', amount: 1500, currency: 'eur' })).toBe('€1,500');
  });

  it('writes in-game currency as a grouped count and its name', () => {
    expect(formatDonation({ name: 'A', amount: 100_000, currency: 'gold' })).toBe('100,000 gold');
    expect(formatDonation({ name: 'A', amount: 500, currency: 'credits' })).toBe('500 Tauri Credits');
  });
});
