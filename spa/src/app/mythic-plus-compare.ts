import { MythicPlusMember, characterKey } from './mythic-plus';
import { characterParam, parseCharacterParam } from './mythic-plus-profile';

/*
 * The pure parts of /mythic-plus/compare: which characters the URL names, and their line colours.
 */

type Character = Pick<MythicPlusMember, 'name' | 'realm'>;

/** How many characters one comparison holds; more columns don't fit beside each other. */
export const COMPARE_LIMIT = 4;

/** `?players=Exkeito-Evermoon,Pashao-Evermoon`: the characters, in order, without repeats, at most COMPARE_LIMIT. */
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

/** Writes parseCompareParam's value. */
export function compareParam(characters: readonly Character[]): string {
  return characters.map(characterParam).join(',');
}


/** Line colours that stay apart when two characters share a class: the class colour first, then a spare. */
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
