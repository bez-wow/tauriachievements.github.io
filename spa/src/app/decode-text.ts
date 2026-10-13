// What DecodeDirective draws while text decodes: which characters scramble, the glyphs they show,
// how a character shows and when each one lands.

// Glyphs by the shape of the letter they stand in for. In a proportional font an M over an i would
// crowd its neighbours, so a narrow letter flickers through narrow ones, a digit through digits
// (all one width), and so on. The scrambled text then keeps the texture of the real one.
const DIGITS = '0123456789';
const NARROW = 'fijlrt';
const LOWER = 'abcdeghknopqsuvxyz';
const LOWER_WIDE = 'mw';
const UPPER = 'ABCDEGHKNOPRSUVXYZ';
const UPPER_WIDE = 'MW';

/** Whether a character scrambles: letters and digits do; spaces, punctuation and emoji stay put. */
export function isDecodable(char: string): boolean {
  return /^[\p{L}\p{N}]\p{M}*$/u.test(char);
}

/** The glyphs `char` flickers through. */
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

/** A glyph for `char` to show while it hasn't landed. */
export function randomGlyph(char: string, random: () => number = Math.random): string {
  const pool = glyphPool(char);
  return pool[Math.floor(random() * pool.length)];
}

/**
 * When each of `count` characters lands, in ms from the start: a wave from the first to the last
 * over three quarters of `duration`, each one up to a quarter of it late, so the edge of what has
 * landed is soft rather than a cursor. All have landed by `duration`.
 */
export function landingTimes(count: number, duration: number, random: () => number = Math.random): number[] {
  return Array.from({ length: count }, (_, index) =>
    (count > 1 ? index / (count - 1) : 0) * duration * .75 + random() * duration * .25);
}

/** How long a text with `count` characters to decode takes, in ms: longer for more, 1.3 to 2.4 s. */
export function decodeDurationFor(count: number): number {
  return Math.min(2400, Math.max(1300, 900 + count * 5));
}

/** `char` as a `text-transform` shows it. */
export function transformed(char: string, textTransform: string): string {
  if (textTransform === 'uppercase') {
    return char.toUpperCase();
  }
  return textTransform === 'lowercase' ? char.toLowerCase() : char;
}

/** A text's characters as the reader sees them: an emoji or a letter with its accent is one. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}
