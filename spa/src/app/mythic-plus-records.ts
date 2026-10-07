import { MythicPlusDungeon, MythicPlusRun } from './mythic-plus';
import { DungeonTimers, dungeonTimers, isTimed } from './mythic-plus-activity';
import { realmSlug } from './mythic-plus-profile';

/*
 * The pure parts of /mythic-plus/records: the highest key timed in each dungeon, the first group
 * to time each key level, and the levels nobody has timed yet. "Timed" is `isTimed`, as on the
 * leaderboard and the stats page, so all three agree.
 */

type RecordRun = Pick<MythicPlusRun, 'id' | 'dungeon' | 'keyLevel' | 'clearTimeSeconds' | 'completedAt'>;

/** The lowest keystone level: the bounty of a dungeon nobody has timed. */
export const LOWEST_KEY_LEVEL = 2;

/** Server firsts start at +10. The levels below all fell on the season's first evening. */
export const FIRSTS_FROM_LEVEL = 10;

/** A claimed bounty stays on the page for a week after the run that claimed it. */
export const CLAIM_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Whose runs count: every realm's, or only the WoD leaderboard's. */
export type RecordsRealm = 'all' | 'wod';

/**
 * Evermoon and Tauri share one leaderboard. WoD has its own, and its groups never mix with the
 * other two, so a run with a WoD character in it is a WoD run.
 */
export function runsOnRealm<T extends Pick<MythicPlusRun, 'roster'>>(runs: readonly T[], realm: RecordsRealm): readonly T[] {
  return realm === 'wod'
    ? runs.filter(run => run.roster.some(member => realmSlug(member.realm) === 'wod'))
    : runs;
}

/** Higher key first; at the same key the faster clear, then the earlier one. */
export function compareRecords(a: RecordRun, b: RecordRun): number {
  return b.keyLevel - a.keyLevel
    || a.clearTimeSeconds - b.clearTimeSeconds
    || compareText(a.completedAt, b.completedAt)
    || compareText(a.id, b.id);
}

/** The best run finished in time (compareRecords), or undefined when none was. */
export function bestTimedRun<T extends RecordRun>(runs: readonly T[], timers: DungeonTimers): T | undefined {
  let best: T | undefined;
  for (const run of runs) {
    if (isTimed(run, timers) && (!best || compareRecords(run, best) < 0)) {
      best = run;
    }
  }

  return best;
}

export interface DungeonRecord<T> {
  dungeon: MythicPlusDungeon;
  /** Undefined until someone times the dungeon. */
  run?: T;
}

/**
 * Each dungeon's record: its highest timed key, at the same key the faster clear, then the
 * earlier one. Highest record first; at the same key the run that used less of its timer leads,
 * then the dungeons' own order. Dungeons nobody has timed come last.
 */
export function dungeonRecords<T extends RecordRun>(
  runs: readonly T[],
  dungeons: readonly MythicPlusDungeon[]
): DungeonRecord<T>[] {
  const timers = dungeonTimers(dungeons);
  const byDungeon = groupByDungeon(runs);
  return dungeons
    .map((dungeon, order) => ({ dungeon, order, run: bestTimedRun(byDungeon.get(dungeon.id) ?? [], timers) }))
    .sort((a, b) => {
      if (!a.run || !b.run) {
        return Number(!a.run) - Number(!b.run) || a.order - b.order;
      }
      return b.run.keyLevel - a.run.keyLevel
        || timerShare(a.run, timers) - timerShare(b.run, timers)
        || a.order - b.order;
    })
    .map(({ dungeon, run }) => ({ dungeon, run }));
}

export interface LevelFirst<T> {
  level: number;
  run: T;
}

/**
 * The first timed run at each key level from `fromLevel` up, highest level first. A level
 * nobody has timed is left out. Of two runs finished in the same second, the faster clear wins.
 */
export function serverFirsts<T extends RecordRun>(
  runs: readonly T[],
  timers: DungeonTimers,
  fromLevel = FIRSTS_FROM_LEVEL
): LevelFirst<T>[] {
  const firsts = new Map<number, T>();
  for (const run of runs) {
    if (run.keyLevel < fromLevel || !isTimed(run, timers)) {
      continue;
    }

    const first = firsts.get(run.keyLevel);
    if (!first || compareFinish(run, first) < 0) {
      firsts.set(run.keyLevel, run);
    }
  }

  return [...firsts].map(([level, run]) => ({ level, run })).sort((a, b) => b.level - a.level);
}

export interface Bounty<T> {
  /** One above the highest timed key: nobody has timed it yet. */
  level: number;
  /** Runs at or above `level`. None of them was timed, so each is an attempt that ran out of time. */
  attempts: number;
  /** The attempt that finished closest to its timer; at the same margin the higher key, then the earlier one. */
  closest?: T;
  /**
   * The first timed run at the level below, while it finished no more than `CLAIM_SHOWN_FOR_MS`
   * before `now`: it claimed the previous bounty.
   */
  claimed?: T;
}

/** The next key level nobody has timed in these runs, and how close anyone came. */
export function openBounty<T extends RecordRun>(runs: readonly T[], timers: DungeonTimers, now: number): Bounty<T> {
  const best = bestTimedRun(runs, timers);
  const level = best ? best.keyLevel + 1 : LOWEST_KEY_LEVEL;
  let attempts = 0;
  let closest: T | undefined;
  let claimed: T | undefined;

  for (const run of runs) {
    if (run.keyLevel >= level) {
      attempts++;
      if (!closest || compareAttempts(run, closest, timers) < 0) {
        closest = run;
      }
    } else if (run.keyLevel === best?.keyLevel && isTimed(run, timers) && (!claimed || compareFinish(run, claimed) < 0)) {
      claimed = run;
    }
  }

  const recent = claimed && now - Date.parse(claimed.completedAt) <= CLAIM_SHOWN_FOR_MS;
  return { level, attempts, closest, claimed: recent ? claimed : undefined };
}

export interface DungeonBounty<T> extends Bounty<T> {
  dungeon: MythicPlusDungeon;
}

/**
 * Each dungeon's open bounty, the lowest level first. At the same level the dungeon whose best
 * attempt came closest leads, then the ones nobody has tried, in the dungeons' own order.
 */
export function dungeonBounties<T extends RecordRun>(
  runs: readonly T[],
  dungeons: readonly MythicPlusDungeon[],
  now: number
): DungeonBounty<T>[] {
  const timers = dungeonTimers(dungeons);
  const byDungeon = groupByDungeon(runs);
  return dungeons
    .map((dungeon, order) => ({ dungeon, order, ...openBounty(byDungeon.get(dungeon.id) ?? [], timers, now) }))
    .sort((a, b) => a.level - b.level
      || (a.closest && b.closest ? timerShare(a.closest, timers) - timerShare(b.closest, timers) : 0)
      || Number(!a.closest) - Number(!b.closest)
      || a.order - b.order)
    .map(({ order, ...bounty }) => bounty);
}

/** How long a record has stood, from when it was set to `now` (both epoch ms): `held for 11 days`. */
export function formatHeldFor(since: number, now: number): string {
  const elapsed = Math.max(0, now - since);
  const days = Math.floor(elapsed / DAY_MS);
  if (days >= 1) {
    return `held for ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const hours = Math.floor(elapsed / HOUR_MS);
  return hours >= 1 ? `held for ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'set in the last hour';
}

/** Clear time as a share of the dungeon's timer: under 1 when timed. */
function timerShare(run: Pick<MythicPlusRun, 'dungeon' | 'clearTimeSeconds'>, timers: DungeonTimers): number {
  const timer = timers.get(run.dungeon) ?? 0;
  return timer > 0 ? run.clearTimeSeconds / timer : Infinity;
}

/** Closer to the timer first, then the higher key, then the earlier finish. */
function compareAttempts(a: RecordRun, b: RecordRun, timers: DungeonTimers): number {
  return timerShare(a, timers) - timerShare(b, timers) || b.keyLevel - a.keyLevel || compareFinish(a, b);
}

/** Earlier finish first; in the same second the faster clear. */
function compareFinish(a: RecordRun, b: RecordRun): number {
  return compareText(a.completedAt, b.completedAt) || a.clearTimeSeconds - b.clearTimeSeconds || compareText(a.id, b.id);
}

function groupByDungeon<T extends Pick<MythicPlusRun, 'dungeon'>>(runs: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const run of runs) {
    const group = groups.get(run.dungeon);
    if (group) {
      group.push(run);
    } else {
      groups.set(run.dungeon, [run]);
    }
  }

  return groups;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
