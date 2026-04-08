import { LadderSelectOption } from './ladder-options';

export const DEFAULT_GUILD_SOURCE_LIMIT = 1000;
export const DEFAULT_GUILD_DISPLAY_LIMIT = 10;

export const GUILD_SOURCE_LIMIT_OPTIONS: ReadonlyArray<LadderSelectOption<number>> = [
  { value: 100, label: 'Top 100' },
  { value: 500, label: 'Top 500' },
  { value: DEFAULT_GUILD_SOURCE_LIMIT, label: 'Top 1000' }
];

export const GUILD_DISPLAY_LIMIT_OPTIONS: ReadonlyArray<LadderSelectOption<number>> = [
  { value: DEFAULT_GUILD_DISPLAY_LIMIT, label: 'Top 10' },
  { value: 50, label: 'Top 50' },
  { value: 100, label: 'Top 100' }
];
