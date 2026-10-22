import { MythicPlusDungeon, MythicPlusMember, MythicPlusRun, characterKey } from './mythic-plus';
import { DungeonTimers, dungeonTimers, isTimed } from './mythic-plus-activity';

type RecordRun = Pick<MythicPlusRun, 'id' | 'dungeon' | 'keyLevel' | 'clearTimeSeconds' | 'completedAt'>;

const LOWEST_KEY_LEVEL = 2;

export const FIRSTS_FROM_LEVEL = 10;

export const CLAIM_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000;

const MOST_RUNS_SHOWN = 10;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function compareRecords(a: RecordRun, b: RecordRun): number {
  return b.keyLevel - a.keyLevel
    || a.clearTimeSeconds - b.clearTimeSeconds
    || compareText(a.completedAt, b.completedAt)
    || compareText(a.id, b.id);
}

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
  run?: T;
}

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
  level: number;
  attempts: number;
  closest?: T;
  claimed?: T;
}

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

export interface RunCount {
  key: string;
  member: MythicPlusMember;
  runs: number;
  timed: number;
  highestTimed?: number;
}

export function mostRuns(
  runs: readonly Pick<MythicPlusRun, 'dungeon' | 'keyLevel' | 'clearTimeSeconds' | 'roster'>[],
  timers: DungeonTimers,
  limit = MOST_RUNS_SHOWN
): RunCount[] {
  type SpecCount = { member: MythicPlusMember; runs: number };
  const characters = new Map<string, {
    runs: number;
    timed: number;
    highestTimed?: number;
    specs: Map<string, SpecCount>;
    mostPlayed: SpecCount;
  }>();

  for (const run of runs) {
    const timed = isTimed(run, timers);
    for (const member of run.roster) {
      const key = characterKey(member);
      let character = characters.get(key);
      if (!character) {
        const first = { member, runs: 0 };
        character = { runs: 0, timed: 0, specs: new Map([[member.spec, first]]), mostPlayed: first };
        characters.set(key, character);
      }

      character.runs++;
      if (timed) {
        character.timed++;
        character.highestTimed = Math.max(character.highestTimed ?? 0, run.keyLevel);
      }

      let spec = character.specs.get(member.spec);
      if (!spec) {
        spec = { member, runs: 0 };
        character.specs.set(member.spec, spec);
      }
      spec.runs++;
      if (spec.runs > character.mostPlayed.runs) {
        character.mostPlayed = spec;
      }
    }
  }

  return [...characters]
    .map(([key, { runs, timed, highestTimed, mostPlayed }]) => ({ key, member: mostPlayed.member, runs, timed, highestTimed }))
    .sort((a, b) => b.runs - a.runs || b.timed - a.timed || compareText(a.key, b.key))
    .slice(0, limit);
}

export function formatHeldFor(since: number, now: number): string {
  const elapsed = Math.max(0, now - since);
  const days = Math.floor(elapsed / DAY_MS);
  if (days >= 1) {
    return `held for ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  const hours = Math.floor(elapsed / HOUR_MS);
  return hours >= 1 ? `held for ${hours} ${hours === 1 ? 'hour' : 'hours'}` : 'set in the last hour';
}

function timerShare(run: Pick<MythicPlusRun, 'dungeon' | 'clearTimeSeconds'>, timers: DungeonTimers): number {
  const timer = timers.get(run.dungeon) ?? 0;
  return timer > 0 ? run.clearTimeSeconds / timer : Infinity;
}

function compareAttempts(a: RecordRun, b: RecordRun, timers: DungeonTimers): number {
  return timerShare(a, timers) - timerShare(b, timers) || b.keyLevel - a.keyLevel || compareFinish(a, b);
}

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
