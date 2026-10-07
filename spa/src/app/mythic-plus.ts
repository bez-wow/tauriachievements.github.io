export type MythicPlusRole = 'tank' | 'healer' | 'dps';
export type RunQuality = 'artifact' | 'legendary' | 'epic' | 'rare' | 'uncommon';

export interface MythicPlusSeason {
  id: string;
  name: string;
  raid: string;
  startDate: string;
}

export interface MythicPlusDungeon {
  /** URL slug, used as the `?dungeon=` value. */
  id: string;
  challengeId: number;
  shortName: string;
  name: string;
  timerSeconds: number;
  icon: string;
  runCount: number;
  bestScore: number;
}

export interface MythicPlusAffix {
  /** The game's affix id. */
  id: number;
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
}

export interface MythicPlusRun {
  id: string;
  dungeon: string;
  keyLevel: number;
  clearTimeSeconds: number;
  score: number;
  completedAt: string;
  affixes: number[];
  roster: MythicPlusMember[];
}

/*
 * The files api/MythicPlusExporter writes to src/mythic-plus-data/ (see MythicPlusFileWriter.cs).
 * index.json holds the season, the dungeons, the affixes and the player and spec tables that
 * every dungeon file points into. The page reads the index first, then only the dungeon files
 * it shows.
 */

// Not 'mythic-plus': a folder named like the /mythic-plus route makes GitHub Pages serve the
// folder instead of the app.
export const MYTHIC_PLUS_DATA_DIR = 'mythic-plus-data';

export interface MythicPlusSpecEntry {
  class: number;
  name: string;
  role: MythicPlusRole;
}

/** `[name, realm, guild ('' when guildless), class, race, gender]` */
export type MythicPlusPlayerEntry = [string, string, string, number, number, number];

/**
 * `[keyLevel, clearTimeMs, completedAt (Unix seconds), score, affixIds, [[player, spec], ...]]`,
 * where player and spec are positions in the index's tables.
 */
export type MythicPlusRunEntry = [number, number, number, number, number[], Array<[number, number]>];

export interface MythicPlusIndex {
  version: number;
  /** When the exporter read the leaderboards, UTC ISO 8601. Missing in older exports. */
  generatedAt?: string;
  season: MythicPlusSeason;
  dungeons: MythicPlusDungeon[];
  affixes: MythicPlusAffix[];
  specs: MythicPlusSpecEntry[];
  players: MythicPlusPlayerEntry[];
}

/** When the data was exported, or undefined when the index has no valid timestamp. */
export function exportedAt(index: Pick<MythicPlusIndex, 'generatedAt'> | undefined): Date | undefined {
  if (!index?.generatedAt) {
    return undefined;
  }
  const date = new Date(index.generatedAt);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface MythicPlusDungeonFile {
  version: number;
  dungeon: string;
  runs: MythicPlusRunEntry[];
}

/**
 * Turns dungeon files into runs. Members are shared: a character who played one spec in a
 * hundred runs is one object, which keeps a season of tens of thousands of runs small.
 */
export function createRunDecoder(
  index: Pick<MythicPlusIndex, 'players' | 'specs'>
): (file: MythicPlusDungeonFile) => MythicPlusRun[] {
  const members = new Map<number, MythicPlusMember>();
  const specCount = Math.max(1, index.specs.length);

  const member = (playerIndex: number, specIndex: number): MythicPlusMember | undefined => {
    const key = playerIndex * specCount + specIndex;
    let decoded = members.get(key);
    if (!decoded) {
      const player = index.players[playerIndex];
      const spec = index.specs[specIndex];
      if (!player || !spec) {
        return undefined;
      }

      const [name, realm, guild, classId, race, gender] = player;
      decoded = { name, realm, guild: guild || undefined, class: classId, race, gender, spec: spec.name, role: spec.role };
      members.set(key, decoded);
    }

    return decoded;
  };

  return file => file.runs.map(([keyLevel, clearTimeMs, completedAt, score, affixes, roster], position) => ({
    id: `${file.dungeon}-${position + 1}`,
    dungeon: file.dungeon,
    keyLevel,
    clearTimeSeconds: clearTimeMs / 1000,
    score,
    completedAt: new Date(completedAt * 1000).toISOString(),
    affixes,
    roster: roster
      .map(([playerIndex, specIndex]) => member(playerIndex, specIndex))
      .filter((decoded): decoded is MythicPlusMember => decoded !== undefined)
  }));
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

/** The affixes of one reset week, and the earliest moment (ms) a run of that week finished. */
export interface AffixWeek {
  affixes: number[];
  since: number;
}

/**
 * The current affix week: the affixes of the newest run that has all three, starting just after
 * the last run whose affixes contradict them. Keys below +4 carry no affixes, so they are placed
 * by time alone; +4 to +9 keys carry the first one or two of the week's affixes.
 */
export function currentAffixWeek(runs: readonly Pick<MythicPlusRun, 'affixes' | 'completedAt'>[]): AffixWeek | undefined {
  let newest: { affixes: number[]; at: number } | undefined;
  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    if (run.affixes.length === 3 && (!newest || at > newest.at)) {
      newest = { affixes: run.affixes, at };
    }
  }

  if (!newest) {
    return undefined;
  }

  const week = newest.affixes;
  let lastOtherWeek = 0;
  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    if (at > lastOtherWeek && run.affixes.some((id, slot) => id !== week[slot])) {
      lastOtherWeek = at;
    }
  }

  return { affixes: [...week], since: lastOtherWeek + 1 };
}

/** One star per keystone upgrade: ★ for +1, ★★ for +2, ★★★ for +3. */
export function upgradeStars(upgrades: number): string {
  return '★'.repeat(Math.max(0, Math.min(3, upgrades)));
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
  return !needle || run.roster.some(member => foldedMemberName(member).includes(needle));
}

/** `name|realm`: one character, whichever spec they played. */
export function characterKey(member: Pick<MythicPlusMember, 'name' | 'realm'>): string {
  return `${member.name}|${member.realm}`;
}

/**
 * Exact match on one character, name and realm, for a player picked from the players view.
 * Unlike the typed search, `Nap` doesn't find `Napim`, nor a `Nap` on another realm.
 */
export function runIncludesCharacter(
  run: { roster: ReadonlyArray<Pick<MythicPlusMember, 'name' | 'realm'>> },
  key: string
): boolean {
  return run.roster.some(member => characterKey(member) === key);
}

/** The same match as `runIncludesPlayer`, for a single character. */
export function memberNameMatches(member: Pick<MythicPlusMember, 'name'>, query: string): boolean {
  const needle = foldName(query.trim());
  return !needle || foldedMemberName(member).includes(needle);
}

export interface PlayerScore {
  /** `characterKey`: a character, whichever spec they played. */
  key: string;
  /** The character as they appear in their highest-scoring run, so with that run's spec. */
  member: MythicPlusMember;
  score: number;
  /** The character's best run in each dungeon they have played, by dungeon id. */
  bestRuns: ReadonlyMap<string, MythicPlusRun>;
}

/**
 * Player score, raider.io's classic model: the sum of a character's best run score in each
 * dungeon. Playing every dungeon counts; farming one doesn't. Given one dungeon's runs, the
 * score is simply the character's best run there. Highest first; ties go by name.
 *
 * `include` limits which roster slots count, e.g. one spec: a character is then scored only on
 * the runs they played as that spec.
 */
export function rankPlayers(
  runs: readonly MythicPlusRun[],
  include?: (member: MythicPlusMember) => boolean
): PlayerScore[] {
  const players = new Map<string, { member: MythicPlusMember; topRun: MythicPlusRun; bestRuns: Map<string, MythicPlusRun> }>();

  for (const run of runs) {
    for (const member of run.roster) {
      if (include && !include(member)) {
        continue;
      }

      const key = characterKey(member);
      let player = players.get(key);
      if (!player) {
        player = { member, topRun: run, bestRuns: new Map() };
        players.set(key, player);
      } else if (isBetterRun(run, player.topRun)) {
        player.member = member;
        player.topRun = run;
      }

      const best = player.bestRuns.get(run.dungeon);
      if (!best || isBetterRun(run, best)) {
        player.bestRuns.set(run.dungeon, run);
      }
    }
  }

  return [...players].map(([key, player]) => {
    let total = 0;
    for (const run of player.bestRuns.values()) {
      total += run.score;
    }

    // Scores carry one decimal; rounding keeps float noise out of ties.
    return { key, member: player.member, score: Math.round(total * 10) / 10, bestRuns: player.bestRuns };
  }).sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function isBetterRun(candidate: MythicPlusRun, current: MythicPlusRun): boolean {
  return candidate.score > current.score
    || (candidate.score === current.score && candidate.clearTimeSeconds < current.clearTimeSeconds);
}

/** Tank, healer, then DPS — keeping the DPS in their original order. */
export function sortRoster<T extends Pick<MythicPlusMember, 'role'>>(roster: readonly T[]): T[] {
  return [...roster].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

export function pageCount(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

// Decoded runs share their member objects, so each name is folded once, not once per run per keystroke.
const foldedNames = new WeakMap<object, string>();

function foldedMemberName(member: Pick<MythicPlusMember, 'name'>): string {
  let folded = foldedNames.get(member);
  if (folded === undefined) {
    folded = foldName(member.name);
    foldedNames.set(member, folded);
  }

  return folded;
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
