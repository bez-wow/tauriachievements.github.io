import { LadderSelectOption } from '../../players/player-filter-options';
import { LadderSort } from './ladder.types';

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
