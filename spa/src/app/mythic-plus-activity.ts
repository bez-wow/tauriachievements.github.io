import { AffixWeek, MythicPlusDungeon, MythicPlusRun, keystoneUpgrades } from './mythic-plus';

/*
 * Season activity for /mythic-plus/stats: runs per day, per dungeon and per key level, and
 * a summary of each affix week. Everything is worked out from the decoded runs.
 */

type ActivityRun = Pick<MythicPlusRun, 'dungeon' | 'keyLevel' | 'clearTimeSeconds' | 'completedAt' | 'affixes' | 'roster'>;

/** Dungeon id -> timer in seconds, to tell timed runs from depleted ones. */
export type DungeonTimers = ReadonlyMap<string, number>;

export function dungeonTimers(dungeons: readonly Pick<MythicPlusDungeon, 'id' | 'timerSeconds'>[]): DungeonTimers {
  return new Map(dungeons.map(dungeon => [dungeon.id, dungeon.timerSeconds]));
}

export function isTimed(run: Pick<MythicPlusRun, 'dungeon' | 'clearTimeSeconds'>, timers: DungeonTimers): boolean {
  return keystoneUpgrades(run.clearTimeSeconds, timers.get(run.dungeon) ?? 0) > 0;
}

/** Key level bands the per-day chart can split by. */
export type LevelBand = 'low' | 'mid' | 'high';

export const LEVEL_BANDS: ReadonlyArray<{ band: LevelBand; label: string }> = [
  { band: 'low', label: '+2 to +9' },
  { band: 'mid', label: '+10 to +14' },
  { band: 'high', label: '+15 and up' }
];

export function levelBand(keyLevel: number): LevelBand {
  return keyLevel >= 15 ? 'high' : keyLevel >= 10 ? 'mid' : 'low';
}

/** The weekly boss/trash affix. Every week has one of the two. */
export type WeekType = 'fortified' | 'tyrannical';

const FORTIFIED = 10;
const TYRANNICAL = 9;

function weekTypeOf(affixes: readonly number[]): WeekType | undefined {
  return affixes.includes(FORTIFIED) ? 'fortified' : affixes.includes(TYRANNICAL) ? 'tyrannical' : undefined;
}

/**
 * Fortified or Tyrannical for a run. Keys below +10 do not carry that affix themselves, so they
 * take it from the affix week they were played in.
 */
export function runWeekType(run: Pick<MythicPlusRun, 'affixes' | 'completedAt'>, weeks: readonly AffixWeekSpan[]): WeekType | undefined {
  return weekTypeOf(run.affixes) ?? weekTypeOf(weeks[weekIndexAt(weeks, Date.parse(run.completedAt))]?.affixes ?? []);
}

/** One affix week; `since` and `until` are epoch ms, `until` is the next week's start. */
export interface AffixWeekSpan extends AffixWeek {
  until?: number;
}

const sameAffixes = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, slot) => id === b[slot]);

/**
 * Every affix week of the season, oldest first. Weeks are the stretches of time in which
 * runs with all three affixes share one set. Like currentAffixWeek, a week starts just after
 * the last earlier run whose affixes contradict it, so +2/+3 keys (no affixes) and +4 to +9
 * keys (one or two affixes) land in the right week. The first week covers everything before.
 */
export function affixWeeks(runs: readonly Pick<MythicPlusRun, 'affixes' | 'completedAt'>[]): AffixWeekSpan[] {
  const timed = runs.map(run => ({ affixes: run.affixes, at: Date.parse(run.completedAt) }));
  const full = timed.filter(run => run.affixes.length === 3).sort((a, b) => a.at - b.at);

  const segments: Array<{ affixes: number[]; first: number }> = [];
  for (const run of full) {
    const last = segments[segments.length - 1];
    if (!last || !sameAffixes(last.affixes, run.affixes)) {
      segments.push({ affixes: [...run.affixes], first: run.at });
    }
  }

  const weeks: AffixWeekSpan[] = segments.map((segment, index) => {
    if (index === 0) {
      return { affixes: segment.affixes, since: 0 };
    }

    let lastOther = segments[index - 1].first;
    for (const run of timed) {
      if (run.at < segment.first && run.at > lastOther
        && run.affixes.some((id, slot) => id !== segment.affixes[slot])) {
        lastOther = run.at;
      }
    }
    return { affixes: segment.affixes, since: lastOther + 1 };
  });

  weeks.forEach((week, index) => {
    if (index + 1 < weeks.length) {
      week.until = weeks[index + 1].since;
    }
  });
  return weeks;
}

/** Index of the week a moment (epoch ms) falls in, or -1 before the first week. */
export function weekIndexAt(weeks: readonly AffixWeekSpan[], at: number): number {
  for (let index = weeks.length - 1; index >= 0; index--) {
    if (at >= weeks[index].since) {
      return index;
    }
  }
  return -1;
}

export interface DayActivity {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  total: number;
  low: number;
  mid: number;
  high: number;
  timed: number;
  depleted: number;
  /** The affix week at midday: resets happen in the morning, so a reset day counts as the new week. */
  week: number;
}

/** Local calendar day as YYYY-MM-DD. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Runs per local calendar day, from the first run to the last, days without runs included. */
export function runsPerDay(runs: readonly ActivityRun[], timers: DungeonTimers, weeks: readonly AffixWeekSpan[] = []): DayActivity[] {
  if (runs.length === 0) {
    return [];
  }

  const byDay = new Map<string, DayActivity>();
  let first = Infinity;
  let last = -Infinity;
  const emptyDay = (day: string): DayActivity => ({ day, total: 0, low: 0, mid: 0, high: 0, timed: 0, depleted: 0, week: -1 });

  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    first = Math.min(first, at);
    last = Math.max(last, at);
    const key = localDay(new Date(at));
    const day = byDay.get(key) ?? emptyDay(key);
    day.total++;
    day[levelBand(run.keyLevel)]++;
    if (isTimed(run, timers)) {
      day.timed++;
    } else {
      day.depleted++;
    }
    byDay.set(key, day);
  }

  const days: DayActivity[] = [];
  const cursor = new Date(first);
  cursor.setHours(12, 0, 0, 0);
  const end = localDay(new Date(last));
  for (;;) {
    const key = localDay(cursor);
    const day = byDay.get(key) ?? emptyDay(key);
    day.week = weekIndexAt(weeks, cursor.getTime());
    days.push(day);
    if (key === end) {
      break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export interface DungeonActivity {
  dungeon: MythicPlusDungeon;
  runs: number;
  timed: number;
  depleted: number;
  /** Highest key finished in time, 0 if none was. */
  highestTimed: number;
  fortified: number;
  tyrannical: number;
  /** Highest key finished in time on each week type, 0 if none was. */
  highestFortified: number;
  highestTyrannical: number;
}

/** Runs per dungeon, most-run first. Dungeons without runs in scope are kept, at the end. */
export function runsPerDungeon(runs: readonly ActivityRun[], dungeons: readonly MythicPlusDungeon[],
  weeks: readonly AffixWeekSpan[] = []): DungeonActivity[] {
  const timers = dungeonTimers(dungeons);
  const rows = new Map(dungeons.map(dungeon => [dungeon.id, {
    dungeon, runs: 0, timed: 0, depleted: 0, highestTimed: 0, fortified: 0, tyrannical: 0, highestFortified: 0, highestTyrannical: 0
  } as DungeonActivity]));

  for (const run of runs) {
    const row = rows.get(run.dungeon);
    if (!row) {
      continue;
    }
    row.runs++;
    const timed = isTimed(run, timers);
    if (timed) {
      row.timed++;
      row.highestTimed = Math.max(row.highestTimed, run.keyLevel);
    } else {
      row.depleted++;
    }
    const type = runWeekType(run, weeks);
    if (type === 'fortified') {
      row.fortified++;
      row.highestFortified = timed ? Math.max(row.highestFortified, run.keyLevel) : row.highestFortified;
    } else if (type === 'tyrannical') {
      row.tyrannical++;
      row.highestTyrannical = timed ? Math.max(row.highestTyrannical, run.keyLevel) : row.highestTyrannical;
    }
  }

  return [...rows.values()].sort((a, b) => b.runs - a.runs);
}

export interface LevelActivity {
  level: number;
  runs: number;
  timed: number;
  depleted: number;
  fortified: number;
  tyrannical: number;
}

/** Runs per key level, every level from the lowest to the highest run included. */
export function keyLevelSpread(runs: readonly ActivityRun[], timers: DungeonTimers,
  weeks: readonly AffixWeekSpan[] = []): LevelActivity[] {
  if (runs.length === 0) {
    return [];
  }

  const levels = runs.map(run => run.keyLevel);
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  const rows: LevelActivity[] = [];
  for (let level = low; level <= high; level++) {
    rows.push({ level, runs: 0, timed: 0, depleted: 0, fortified: 0, tyrannical: 0 });
  }

  for (const run of runs) {
    const row = rows[run.keyLevel - low];
    row.runs++;
    if (isTimed(run, timers)) {
      row.timed++;
    } else {
      row.depleted++;
    }
    const type = runWeekType(run, weeks);
    if (type) {
      row[type]++;
    }
  }
  return rows;
}

export interface WeekActivity {
  week: AffixWeekSpan;
  runs: number;
  timed: number;
  highestTimed: number;
  /** Distinct players (character name and realm) with a run that week. */
  players: number;
  /** First and last run of the week, epoch ms. */
  firstRun: number;
  lastRun: number;
}

/** One summary per affix week, oldest first. */
export function weekSummaries(runs: readonly ActivityRun[], timers: DungeonTimers, weeks: readonly AffixWeekSpan[]): WeekActivity[] {
  const rows = weeks.map(week => ({
    week, runs: 0, timed: 0, highestTimed: 0, players: new Set<string>(), firstRun: Infinity, lastRun: -Infinity
  }));

  for (const run of runs) {
    const at = Date.parse(run.completedAt);
    const row = rows[weekIndexAt(weeks, at)];
    if (!row) {
      continue;
    }
    row.runs++;
    row.firstRun = Math.min(row.firstRun, at);
    row.lastRun = Math.max(row.lastRun, at);
    if (isTimed(run, timers)) {
      row.timed++;
      row.highestTimed = Math.max(row.highestTimed, run.keyLevel);
    }
    for (const member of run.roster) {
      row.players.add(`${member.name}-${member.realm}`);
    }
  }

  return rows.map(row => ({ ...row, players: row.players.size }));
}

/** Round axis steps (1, 2 or 5 times a power of ten) from 0 up to at least `max`. */
export function countTicks(max: number, targetSteps = 4): number[] {
  if (!(max > 0)) {
    return [0, 1];
  }

  const rough = max / targetSteps;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map(factor => factor * power).find(value => value >= rough) ?? 10 * power;
  const ticks: number[] = [];
  for (let value = 0; value < max + step; value += step) {
    ticks.push(value);
    if (value >= max) {
      break;
    }
  }
  return ticks;
}
