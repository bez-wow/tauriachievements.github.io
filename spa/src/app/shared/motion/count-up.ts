export interface CountText {
  prefix: string;
  value: number;
  suffix: string;
  decimals: number;
  grouped: boolean;
}

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

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
    grouped: !/\d{4}/.test(digits)
  };
}

export function formatCountText(shape: CountText, value: number): string {
  const number = value.toLocaleString('en-GB', {
    minimumFractionDigits: shape.decimals,
    maximumFractionDigits: shape.decimals,
    useGrouping: shape.grouped
  });
  return `${shape.prefix}${number}${shape.suffix}`;
}

export function easeOutExpo(progress: number): number {
  return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
}
