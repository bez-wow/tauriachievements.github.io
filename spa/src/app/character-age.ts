export interface CharacterAgeParts {
  years: number;
  months: number;
  days: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Today as whole days since 1970-01-01 (UTC), the unit player snapshots store dates in. */
export function currentEpochDay(now: number = Date.now()): number {
  return Math.floor(now / MS_PER_DAY);
}

/**
 * Calendar difference between two days (days since 1970-01-01, UTC): whole months first,
 * then the remaining days. Adding the months to the start clamps to the end of a shorter
 * month (Jan 31 + 1 month = Feb 28), so the day count can never go negative.
 */
export function getCharacterAgeParts(startDay: number, endDay: number): CharacterAgeParts {
  if (endDay <= startDay) {
    return { years: 0, months: 0, days: 0 };
  }

  const start = new Date(startDay * MS_PER_DAY);
  const end = new Date(endDay * MS_PER_DAY);
  let totalMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());

  if (addMonthsClamped(start, totalMonths) > end.getTime()) {
    totalMonths--;
  }

  const days = Math.round((end.getTime() - addMonthsClamped(start, totalMonths)) / MS_PER_DAY);

  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    days
  };
}

/**
 * "7 years 5 months 26 days" from the day a character earned "Level 10" until today,
 * leaving out zero parts. Empty when the date is unknown (0).
 */
export function formatCharacterAge(level10Day: number, today: number = currentEpochDay()): string {
  if (!level10Day) {
    return '';
  }

  const { years, months, days } = getCharacterAgeParts(level10Day, today);
  const formattedParts = [
    formatAgePart(years, 'year', 'years'),
    formatAgePart(months, 'month', 'months'),
    formatAgePart(days, 'day', 'days')
  ].filter((part) => part !== '');

  return formattedParts.length > 0 ? formattedParts.join(' ') : '0 days';
}

function addMonthsClamped(date: Date, months: number): number {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return Date.UTC(year, month, Math.min(date.getUTCDate(), daysInMonth));
}

function formatAgePart(value: number, singularLabel: string, pluralLabel: string): string {
  if (value === 0) {
    return '';
  }

  return `${value} ${value === 1 ? singularLabel : pluralLabel}`;
}
