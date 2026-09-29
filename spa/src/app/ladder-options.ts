import { getClassIconPath } from '../utils/classIconHelper';
import { LadderSort } from './ladder.types';

export interface LadderSelectOption<TValue> {
  value: TValue;
  label: string;
}

export interface LadderClassOption {
  id: number;
  name: string;
  icon: string;
}

export const DEFAULT_SORT: LadderSort = 'achievementPoints';
export const DEFAULT_PAGE_SIZE = 100;
export const PAGE_SIZE_OPTIONS = [100, 500, 1000] as const;

export const SORT_OPTIONS: ReadonlyArray<LadderSelectOption<LadderSort>> = [
  { value: 'achievementPoints', label: 'Character Achievements' },
  { value: 'achievementsTotal', label: 'Account Wide Achievements' },
  { value: 'honorableKills', label: 'Honorable Kills' },
  { value: 'playedTime', label: 'Time Played' },
  { value: 'ilvl', label: 'Item Level' },
  { value: 'appearanceCount', label: 'Appearances' }
];

export const REALM_OPTIONS: ReadonlyArray<LadderSelectOption<string | undefined>> = [
  { value: undefined, label: 'All Realms' },
  { value: 'Evermoon', label: 'Evermoon' },
  { value: 'Tauri', label: 'Tauri' },
  { value: 'WoD', label: 'WoD' }
];

export const FACTION_OPTIONS: ReadonlyArray<LadderSelectOption<string | undefined>> = [
  { value: undefined, label: 'All Factions' },
  { value: 'Horde', label: 'Horde' },
  { value: 'Alliance', label: 'Alliance' }
];

export const CLASS_OPTIONS: ReadonlyArray<LadderClassOption> = [
  { id: 6, name: 'Death Knight', icon: getClassIconPath(6) },
  { id: 12, name: 'Demon Hunter', icon: getClassIconPath(12) },
  { id: 11, name: 'Druid', icon: getClassIconPath(11) },
  { id: 3, name: 'Hunter', icon: getClassIconPath(3) },
  { id: 8, name: 'Mage', icon: getClassIconPath(8) },
  { id: 10, name: 'Monk', icon: getClassIconPath(10) },
  { id: 2, name: 'Paladin', icon: getClassIconPath(2) },
  { id: 5, name: 'Priest', icon: getClassIconPath(5) },
  { id: 4, name: 'Rogue', icon: getClassIconPath(4) },
  { id: 7, name: 'Shaman', icon: getClassIconPath(7) },
  { id: 9, name: 'Warlock', icon: getClassIconPath(9) },
  { id: 1, name: 'Warrior', icon: getClassIconPath(1) }
];
