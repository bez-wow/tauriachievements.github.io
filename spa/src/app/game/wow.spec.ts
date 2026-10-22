import { describe, expect, it } from 'vitest';
import { raceFaction, realmSlug } from './wow';

describe('raceFaction', () => {
  it('knows each race\'s side, and none for the neutral Pandaren', () => {
    expect([raceFaction(1), raceFaction(10), raceFaction(25), raceFaction(26), raceFaction(24)]).toEqual([0, 1, 0, 1, undefined]);
  });
});

describe('realmSlug', () => {
  it('lowercases the realm for URLs', () => {
    expect(realmSlug('WoD')).toBe('wod');
  });
});
