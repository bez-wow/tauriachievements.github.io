export type MythicPlusRole = 'tank' | 'healer' | 'dps';
export type RunQuality = 'artifact' | 'legendary' | 'epic' | 'rare' | 'uncommon';

export interface MythicPlusSeason {
  id: string;
  name: string;
  raid: string;
  startDate: string;
}

export interface MythicPlusDungeon {
  id: string;
  shortName: string;
  name: string;
  timerSeconds: number;
  icon: string;
}

export interface MythicPlusAffix {
  id: string;
  name: string;
  /** Keystone level the affix activates at (4, 7 or 10 in Legion). */
  level: number;
  icon: string;
  description: string;
}

export interface MythicPlusMember {
  name: string;
  realm: string;
  guild?: string;
  class: number;
  race: number;
  gender: number;
  spec: string;
  role: MythicPlusRole;
  itemLevel?: number;
}

export interface MythicPlusRun {
  id: string;
  dungeon: string;
  keyLevel: number;
  clearTimeSeconds: number;
  score: number;
  completedAt: string;
  affixes: string[];
  roster: MythicPlusMember[];
}

export interface MythicPlusDataset {
  /** True while the file holds made-up runs rather than real keystone results. */
  isSampleData?: boolean;
  season: MythicPlusSeason;
  dungeons: MythicPlusDungeon[];
  affixes: MythicPlusAffix[];
  runs: MythicPlusRun[];
}

export interface UpgradeCutoff {
  upgrades: number;
  percent: number;
}

/** Legion keystone upgrades: +3 within 60% of the timer, +2 within 80%, +1 within the timer. */
export const UPGRADE_CUTOFFS: ReadonlyArray<UpgradeCutoff> = [
  { upgrades: 3, percent: 60 },
  { upgrades: 2, percent: 80 },
  { upgrades: 1, percent: 100 }
];

export const ROLE_LABELS: Readonly<Record<MythicPlusRole, string>> = {
  tank: 'Tank',
  healer: 'Healer',
  dps: 'DPS'
};

const ROLE_ORDER: Readonly<Record<MythicPlusRole, number>> = { tank: 0, healer: 1, dps: 2 };

export const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

export const CLASS_COLORS: Readonly<Record<number, string>> = {
  1: '#c79c6e',
  2: '#f58cba',
  3: '#abd473',
  4: '#fff569',
  5: '#ffffff',
  6: '#c41f3b',
  7: '#0070de',
  8: '#69ccf0',
  9: '#9482c9',
  10: '#00ff96',
  11: '#ff7d0a',
  12: '#a330c9'
};

export function keystoneUpgrades(clearTimeSeconds: number, timerSeconds: number): number {
  if (!(clearTimeSeconds > 0) || !(timerSeconds > 0)) {
    return 0;
  }

  // Integer comparison keeps the 60% / 80% boundaries exact.
  return UPGRADE_CUTOFFS.find(cutoff => clearTimeSeconds * 100 <= timerSeconds * cutoff.percent)?.upgrades ?? 0;
}

export function upgradeCutoffs(timerSeconds: number): Array<UpgradeCutoff & { seconds: number }> {
  return UPGRADE_CUTOFFS.map(cutoff => ({
    ...cutoff,
    seconds: Math.floor((timerSeconds * cutoff.percent) / 100)
  }));
}

/** Fixed-width `00:29:07`, used in the leaderboard's Time column. */
export function formatDuration(totalSeconds: number): string {
  const seconds = normalizeSeconds(totalSeconds);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(pad).join(':');
}

/** Compact `29:07`, or `1:02:05` past the hour. */
export function formatClock(totalSeconds: number): string {
  const seconds = normalizeSeconds(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = pad(seconds % 60);

  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

/** Signed distance from the timer: `-5:53` when under, `+2:10` when over. */
export function formatTimerDelta(clearTimeSeconds: number, timerSeconds: number): string {
  const delta = Math.round(clearTimeSeconds - timerSeconds);
  if (!Number.isFinite(delta) || delta === 0) {
    return '0:00';
  }

  return `${delta < 0 ? '-' : '+'}${formatClock(Math.abs(delta))}`;
}

/** Highest score first; a faster clear breaks ties. Returns a new array. */
export function rankRuns<T extends Pick<MythicPlusRun, 'id' | 'score' | 'clearTimeSeconds'>>(runs: readonly T[]): T[] {
  return [...runs].sort((a, b) =>
    b.score - a.score
    || a.clearTimeSeconds - b.clearTimeSeconds
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** WoW item-quality tier for a run, relative to the season's best score. */
export function scoreQuality(score: number, bestScore: number): RunQuality {
  if (!(bestScore > 0)) {
    return 'uncommon';
  }

  if (score >= bestScore) {
    return 'artifact';
  }

  const ratio = score / bestScore;
  if (ratio >= 0.9) {
    return 'legendary';
  }

  if (ratio >= 0.84) {
    return 'epic';
  }

  return ratio >= 0.76 ? 'rare' : 'uncommon';
}

/** Case- and accent-insensitive partial match, so `bjorn` finds `Björñ`. An empty query matches every run. */
export function runIncludesPlayer(run: { roster: ReadonlyArray<Pick<MythicPlusMember, 'name'>> }, query: string): boolean {
  const needle = foldName(query.trim());
  return !needle || run.roster.some(member => foldName(member.name).includes(needle));
}

/** Tank, healer, then DPS — keeping the DPS in their original order. */
export function sortRoster<T extends Pick<MythicPlusMember, 'role'>>(roster: readonly T[]): T[] {
  return [...roster].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

export function pageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function foldName(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

function normalizeSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
