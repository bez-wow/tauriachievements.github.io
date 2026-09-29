export interface CharacterAgeParts {
  years: number;
  months: number;
  days: number;
}

const CHARACTER_AGE_PATTERN = /^(\d+)\s+years?\s+(\d+)\s+months?\s+(\d+)\s+days?$/i;

export function parseCharacterAge(characterAge: string | null | undefined): CharacterAgeParts | undefined {
  const normalizedAge = characterAge?.trim();
  if (!normalizedAge) {
    return undefined;
  }

  const match = CHARACTER_AGE_PATTERN.exec(normalizedAge);
  if (!match) {
    return undefined;
  }

  return {
    years: Number(match[1]),
    months: Number(match[2]),
    days: Number(match[3])
  };
}

export function formatCharacterAge(characterAge: string | null | undefined): string {
  const normalizedAge = characterAge?.trim() ?? '';
  if (!normalizedAge) {
    return '';
  }

  const ageParts = parseCharacterAge(normalizedAge);
  if (!ageParts) {
    return normalizedAge;
  }

  const formattedParts = [
    formatAgePart(ageParts.years, 'year', 'years'),
    formatAgePart(ageParts.months, 'month', 'months'),
    formatAgePart(ageParts.days, 'day', 'days')
  ].filter((part) => part !== '');

  return formattedParts.length > 0 ? formattedParts.join(' ') : '0 days';
}

function formatAgePart(value: number, singularLabel: string, pluralLabel: string): string {
  if (value === 0) {
    return '';
  }

  return `${value} ${value === 1 ? singularLabel : pluralLabel}`;
}
