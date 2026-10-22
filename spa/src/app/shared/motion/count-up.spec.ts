import { describe, expect, it } from 'vitest';
import { easeOutExpo, formatCountText, parseCountText } from './count-up';

describe('parseCountText', () => {
  it('takes apart the numbers the M+ pages show', () => {
    expect(parseCountText('41,401')).toEqual({ prefix: '', value: 41401, suffix: '', decimals: 0, grouped: true });
    expect(parseCountText('90%')).toEqual({ prefix: '', value: 90, suffix: '%', decimals: 0, grouped: true });
    expect(parseCountText('+20')).toEqual({ prefix: '+', value: 20, suffix: '', decimals: 0, grouped: true });
    expect(parseCountText('#1,204')).toEqual({ prefix: '#', value: 1204, suffix: '', decimals: 0, grouped: true });
    expect(parseCountText('78 runs')).toEqual({ prefix: '', value: 78, suffix: ' runs', decimals: 0, grouped: true });
  });

  it('keeps a toFixed score ungrouped, with its decimal', () => {
    expect(parseCountText('1687.9')).toEqual({ prefix: '', value: 1687.9, suffix: '', decimals: 1, grouped: false });
  });

  it('has nothing to count in a dash', () => {
    expect(parseCountText('-')).toBeUndefined();
  });
});

describe('formatCountText', () => {
  it('writes a value on its way the way the target is written', () => {
    expect(formatCountText(parseCountText('41,401')!, 12345)).toBe('12,345');
    expect(formatCountText(parseCountText('1687.9')!, 1234.5)).toBe('1234.5');
    expect(formatCountText(parseCountText('1687.9')!, 12)).toBe('12.0');
    expect(formatCountText(parseCountText('+20')!, 7)).toBe('+7');
    expect(formatCountText(parseCountText('78 runs')!, 0)).toBe('0 runs');
  });

  it('ends on exactly the text it was given', () => {
    for (const text of ['41,401', '90%', '+20', '#3', '1687.9', '80 runs']) {
      const shape = parseCountText(text)!;
      expect(formatCountText(shape, shape.value)).toBe(text);
    }
  });
});

describe('easeOutExpo', () => {
  it('runs from 0 to 1, most of the way early', () => {
    expect(easeOutExpo(0)).toBe(0);
    expect(easeOutExpo(1)).toBe(1);
    expect(easeOutExpo(.3)).toBeGreaterThan(.85);
  });
});
