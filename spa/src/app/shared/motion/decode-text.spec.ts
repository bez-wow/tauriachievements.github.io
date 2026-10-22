import { describe, expect, it } from 'vitest';
import { decodeDurationFor, glyphPool, graphemes, isDecodable, landingTimes, randomGlyph, transformed } from './decode-text';

describe('isDecodable', () => {
  it('scrambles letters and digits, accented and Cyrillic ones too', () => {
    for (const char of ['a', 'Z', '7', 'á', 'Ő', 'ж']) {
      expect(isDecodable(char)).toBe(true);
    }
  });

  it('leaves spaces, punctuation and emoji alone', () => {
    for (const char of [' ', '/', '’', '!', '€', '💪', '🤓']) {
      expect(isDecodable(char)).toBe(false);
    }
  });
});

describe('glyphPool', () => {
  it('matches the shape of the letter', () => {
    expect(glyphPool('5')).toBe('0123456789');
    expect(glyphPool('i')).toBe(glyphPool('l'));
    expect(glyphPool('I')).toBe(glyphPool('t'));
    expect(glyphPool('m')).toBe('mw');
    expect(glyphPool('W')).toBe('MW');
    expect(glyphPool('a')).toMatch(/^[a-z]+$/);
    expect(glyphPool('Q')).toMatch(/^[A-Z]+$/);
    expect(glyphPool('Ő')).toMatch(/^[A-Z]+$/);
  });
});

describe('randomGlyph', () => {
  it('picks from the letter’s pool', () => {
    expect(randomGlyph('8', () => 0)).toBe('0');
    expect(randomGlyph('8', () => .99)).toBe('9');
    for (let index = 0; index < 50; index++) {
      expect(glyphPool('k')).toContain(randomGlyph('k'));
    }
  });
});

describe('landingTimes', () => {
  it('lands the first first and the last last, all within the duration', () => {
    expect(landingTimes(5, 1000, () => 0)).toEqual([0, 187.5, 375, 562.5, 750]);
    expect(landingTimes(5, 1000, () => 1)).toEqual([250, 437.5, 625, 812.5, 1000]);
  });

  it('copes with a single character', () => {
    expect(landingTimes(1, 1000, () => .5)).toEqual([125]);
  });
});

describe('decodeDurationFor', () => {
  it('takes longer for more text, within bounds', () => {
    expect(decodeDurationFor(10)).toBe(1300);
    expect(decodeDurationFor(200)).toBe(1900);
    expect(decodeDurationFor(1000)).toBe(2400);
  });
});

describe('transformed', () => {
  it('cases a character as text-transform would', () => {
    expect(transformed('q', 'uppercase')).toBe('Q');
    expect(transformed('Q', 'lowercase')).toBe('q');
    expect(transformed('q', 'none')).toBe('q');
  });
});

describe('graphemes', () => {
  it('keeps an emoji or an accented letter whole', () => {
    expect(graphemes('ok 💪🏻')).toEqual(['o', 'k', ' ', '💪🏻']);
    expect(graphemes('Tá')).toEqual(['T', 'á']);
  });
});
