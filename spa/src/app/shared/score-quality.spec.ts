import { describe, it, expect } from 'vitest';
import { scoreQuality } from './score-quality';

describe('scoreQuality', () => {
  it('maps the score relative to the best run onto item-quality tiers', () => {
    expect(scoreQuality(200, 200)).toBe('artifact');
    expect(scoreQuality(196, 200)).toBe('legendary');
    expect(scoreQuality(180, 200)).toBe('legendary');
    expect(scoreQuality(172, 200)).toBe('epic');
    expect(scoreQuality(160, 200)).toBe('rare');
    expect(scoreQuality(100, 200)).toBe('uncommon');
    expect(scoreQuality(100, 0)).toBe('uncommon');
  });
});
