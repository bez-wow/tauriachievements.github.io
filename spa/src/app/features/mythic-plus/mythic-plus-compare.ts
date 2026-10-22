import { MythicPlusMember, characterKey } from './mythic-plus';
import { characterParam, parseCharacterParam } from './mythic-plus-profile';

type Character = Pick<MythicPlusMember, 'name' | 'realm'>;

export const COMPARE_LIMIT = 4;

export function parseCompareParam(value: string | null | undefined): Character[] {
  const found: Character[] = [];
  const seen = new Set<string>();
  for (const part of (value ?? '').split(',')) {
    const character = parseCharacterParam(part.trim());
    const key = character && characterKey(character).toLowerCase();
    if (character && key && !seen.has(key) && found.length < COMPARE_LIMIT) {
      seen.add(key);
      found.push(character);
    }
  }
  return found;
}

export function compareParam(characters: readonly Character[]): string {
  return characters.map(characterParam).join(',');
}

const SPARE_COLORS = ['#4fc3f7', '#ffffff', '#ef5350', '#9ccc65', '#ba68c8', '#f7b500'];

export function seriesColors(classColors: readonly string[]): string[] {
  const used = new Set<string>();
  return classColors.map(color => {
    const pick = used.has(color.toLowerCase())
      ? SPARE_COLORS.find(spare => !used.has(spare.toLowerCase())) ?? color
      : color;
    used.add(pick.toLowerCase());
    return pick;
  });
}
