const DIGITS = '0123456789';
const NARROW = 'fijlrt';
const LOWER = 'abcdeghknopqsuvxyz';
const LOWER_WIDE = 'mw';
const UPPER = 'ABCDEGHKNOPRSUVXYZ';
const UPPER_WIDE = 'MW';

export function isDecodable(char: string): boolean {
  return /^[\p{L}\p{N}]\p{M}*$/u.test(char);
}

export function glyphPool(char: string): string {
  if (/^\p{N}$/u.test(char)) {
    return DIGITS;
  }
  if (/^[fijlrtI]$/.test(char)) {
    return NARROW;
  }
  if (char === 'm' || char === 'w') {
    return LOWER_WIDE;
  }
  if (char === 'M' || char === 'W') {
    return UPPER_WIDE;
  }
  return char !== char.toLowerCase() ? UPPER : LOWER;
}

export function randomGlyph(char: string, random: () => number = Math.random): string {
  const pool = glyphPool(char);
  return pool[Math.floor(random() * pool.length)];
}

export function landingTimes(count: number, duration: number, random: () => number = Math.random): number[] {
  return Array.from({ length: count }, (_, index) =>
    (count > 1 ? index / (count - 1) : 0) * duration * .75 + random() * duration * .25);
}

export function decodeDurationFor(count: number): number {
  return Math.min(2400, Math.max(1300, 900 + count * 5));
}

export function transformed(char: string, textTransform: string): string {
  if (textTransform === 'uppercase') {
    return char.toUpperCase();
  }
  return textTransform === 'lowercase' ? char.toLowerCase() : char;
}

export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}
