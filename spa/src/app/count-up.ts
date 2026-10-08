/** A displayed number taken apart: "+20" is "+", 20, "". */
export interface CountText {
  prefix: string;
  value: number;
  suffix: string;
  decimals: number;
  /** Thousands separated by commas ("41,401"), as toLocaleString('en-GB') writes them. */
  grouped: boolean;
}

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

/** The first number in a text and what is around it, or undefined when there is none ("-"). */
export function parseCountText(text: string): CountText | undefined {
  const match = NUMBER.exec(text);
  if (!match) {
    return undefined;
  }
  const digits = match[0];
  const decimals = digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0;
  return {
    prefix: text.slice(0, match.index),
    value: Number(digits.replace(/,/g, '')),
    suffix: text.slice(match.index + digits.length),
    decimals,
    // "1687.9" (toFixed) has four digits in a row and no commas; anything shorter could be either,
    // and the larger numbers it passes through while counting read better with them.
    grouped: !/\d{4}/.test(digits)
  };
}

/** `value` written the way `shape` is: same prefix, suffix, decimals and separators. */
export function formatCountText(shape: CountText, value: number): string {
  const number = value.toLocaleString('en-GB', {
    minimumFractionDigits: shape.decimals,
    maximumFractionDigits: shape.decimals,
    useGrouping: shape.grouped
  });
  return `${shape.prefix}${number}${shape.suffix}`;
}

/** Fast start, soft landing: most of the distance in the first third. */
export function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}
