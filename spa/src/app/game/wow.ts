import { getClassIconPath } from './classIconHelper';
import { getClassColor } from './class-colors';
import { FilterDropdownOption } from '../shared/filter-dropdown.types';

export type Role = 'tank' | 'healer' | 'dps';

export type Realm = 'Evermoon' | 'Tauri' | 'WoD';

export const REALMS: readonly Realm[] = ['Evermoon', 'Tauri', 'WoD'];

export function realmSlug(realm: string): string {
  return realm.toLowerCase();
}

export const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

export const CLASSES_BY_NAME: ReadonlyArray<{ readonly id: number; readonly name: string }> = Object.entries(CLASS_NAMES)
  .map(([id, name]) => ({ id: Number(id), name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const CLASS_FILTER_OPTIONS: ReadonlyArray<FilterDropdownOption> = [
  { value: undefined, label: 'All classes' },
  ...CLASSES_BY_NAME.map(({ id, name }) => ({
    value: id,
    label: name,
    icon: getClassIconPath(id),
    color: getClassColor(id)
  }))
];

export const RACE_NAMES: Readonly<Record<number, string>> = {
  1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf',
  5: 'Undead', 6: 'Tauren', 7: 'Gnome', 8: 'Troll',
  9: 'Goblin', 10: 'Blood Elf', 11: 'Draenei', 22: 'Worgen',
  24: 'Pandaren', 25: 'Pandaren', 26: 'Pandaren'
};

const ALLIANCE_RACES: ReadonlySet<number> = new Set([1, 3, 4, 7, 11, 22, 25]);
const HORDE_RACES: ReadonlySet<number> = new Set([2, 5, 6, 8, 9, 10, 26]);

export function raceFaction(race: number): number | undefined {
  return ALLIANCE_RACES.has(race) ? 0 : HORDE_RACES.has(race) ? 1 : undefined;
}

export const ROLES: readonly Role[] = ['tank', 'healer', 'dps'];

export function parseRole(value: string | null | undefined): Role | undefined {
  return ROLES.find(role => role === value);
}

export function parseClassId(value: string | null): number | undefined {
  const classId = Number(value);
  return value && CLASS_NAMES[classId] ? classId : undefined;
}
