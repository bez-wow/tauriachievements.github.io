import { describe, expect, it } from 'vitest';
import {
  affixWeeks,
  countTicks,
  dungeonTimers,
  keyLevelSpread,
  levelBand,
  runsPerDay,
  runsPerDungeon,
  runWeekType,
  weekIndexAt,
  weekSummaries
} from './mythic-plus-activity';
import { MythicPlusDungeon, MythicPlusMember, currentAffixWeek } from './mythic-plus';

const dungeon = (id: string, timerSeconds = 1800): MythicPlusDungeon =>
  ({ id, challengeId: 0, shortName: id.toUpperCase(), name: id, timerSeconds, icon: '', runCount: 0, bestScore: 0 });
const member = (name: string): MythicPlusMember =>
  ({ name, realm: 'Evermoon', class: 11, race: 4, gender: 1, spec: 'Restoration', role: 'healer' });
/** A run finishing at a local time, so day grouping is the same in every time zone. */
const run = (local: [number, number, number, number], keyLevel: number, clearTimeSeconds: number,
  affixes: number[] = [], dungeonId = 'nl', roster = [member('Pretz')]) => ({
  dungeon: dungeonId,
  keyLevel,
  clearTimeSeconds,
  completedAt: new Date(2026, local[0] - 1, local[1], local[2], local[3]).toISOString(),
  affixes,
  roster
});
const timers = dungeonTimers([dungeon('nl', 1800), dungeon('eoa', 2100)]);

describe('affixWeeks', () => {
  const runs = [
    run([9, 16, 14, 0], 12, 1500, [7, 1, 9]),
    run([9, 22, 23, 0], 5, 1500, [7]),
    run([9, 23, 8, 49], 2, 1500, []),
    run([9, 23, 9, 40], 10, 1500, [8, 3, 10]),
    run([9, 29, 20, 0], 11, 1500, [8, 3, 10]),
    run([9, 30, 8, 49], 4, 1500, [8]),
    run([9, 30, 9, 40], 15, 1500, [5, 4, 9]),
    run([10, 5, 19, 59], 19, 1500, [5, 4, 9])
  ];

  it('splits the season where the affix set changes and starts each week after the last contradicting run', () => {
    const weeks = affixWeeks(runs);
    expect(weeks.map(week => week.affixes)).toEqual([[7, 1, 9], [8, 3, 10], [5, 4, 9]]);
    expect(weeks[0].since).toBe(0);
    expect(weeks[1].since).toBe(Date.parse(runs[1].completedAt) + 1);
    expect(weeks[2].since).toBe(Date.parse(runs[5].completedAt) + 1);
    expect(weeks[1].until).toBe(weeks[2].since);
    expect(weeks[2].until).toBeUndefined();
  });

  it('ends on the same week as currentAffixWeek', () => {
    const weeks = affixWeeks(runs);
    expect(weeks[weeks.length - 1]).toEqual(currentAffixWeek(runs));
  });

  it('places keys without affixes by time', () => {
    const weeks = affixWeeks(runs);
    expect(weekIndexAt(weeks, Date.parse(runs[2].completedAt))).toBe(1);
    expect(weekIndexAt(weeks, Date.parse(runs[1].completedAt))).toBe(0);
  });

  it('has no weeks without a run carrying all three affixes', () => {
    expect(affixWeeks([run([9, 16, 14, 0], 3, 1500, [])])).toEqual([]);
  });
});

describe('runsPerDay', () => {
  it('counts each local day, fills days without runs and splits by band and result', () => {
    const days = runsPerDay([
      run([9, 29, 23, 30], 16, 1500),
      run([9, 29, 0, 10], 9, 1900),
      run([10, 1, 12, 0], 10, 1200)
    ], timers);

    expect(days.map(day => [day.day, day.total])).toEqual([['2026-09-29', 2], ['2026-09-30', 0], ['2026-10-01', 1]]);
    expect(days[0]).toMatchObject({ low: 1, high: 1, mid: 0, timed: 1, depleted: 1 });
    expect(days[2]).toMatchObject({ mid: 1, timed: 1 });
  });

  it('assigns each day to the week it is in at midday', () => {
    const runs = [run([9, 22, 20, 0], 12, 1500, [7, 1, 9]), run([9, 23, 9, 40], 12, 1500, [8, 3, 10])];
    expect(runsPerDay(runs, timers, affixWeeks(runs)).map(day => day.week)).toEqual([0, 1]);
  });

  it('is empty without runs', () => {
    expect(runsPerDay([], timers)).toEqual([]);
  });
});

describe('runsPerDungeon', () => {
  it('counts runs, timed runs and the highest timed key, most-run first', () => {
    const rows = runsPerDungeon([
      run([10, 1, 12, 0], 19, 1700, [], 'nl'),
      run([10, 1, 12, 0], 20, 1900, [], 'nl'),
      run([10, 1, 12, 0], 15, 2000, [], 'eoa')
    ], [dungeon('eoa', 2100), dungeon('nl', 1800), dungeon('brh')]);

    expect(rows.map(row => [row.dungeon.id, row.runs, row.timed, row.depleted, row.highestTimed]))
      .toEqual([['nl', 2, 1, 1, 19], ['eoa', 1, 1, 0, 15], ['brh', 0, 0, 0, 0]]);
  });
});

describe('keyLevelSpread', () => {
  it('lists every level between the lowest and highest key', () => {
    const rows = keyLevelSpread([run([10, 1, 12, 0], 2, 1000), run([10, 1, 12, 0], 4, 2000), run([10, 1, 12, 0], 4, 1000)], timers);
    expect(rows).toEqual([
      { level: 2, runs: 1, timed: 1, depleted: 0, fortified: 0, tyrannical: 0 },
      { level: 3, runs: 0, timed: 0, depleted: 0, fortified: 0, tyrannical: 0 },
      { level: 4, runs: 2, timed: 1, depleted: 1, fortified: 0, tyrannical: 0 }
    ]);
  });
});

describe('weekSummaries', () => {
  it('summarises runs, timed runs, the highest timed key and distinct players per week', () => {
    const runs = [
      run([9, 22, 20, 0], 12, 1500, [7, 1, 9], 'nl', [member('Pretz'), member('Bezhududu')]),
      run([9, 22, 21, 0], 14, 1900, [7, 1, 9], 'nl', [member('Pretz')]),
      run([9, 23, 9, 40], 16, 1500, [8, 3, 10], 'nl', [member('Deepguy')])
    ];
    const rows = weekSummaries(runs, timers, affixWeeks(runs));
    expect(rows.map(row => [row.runs, row.timed, row.highestTimed, row.players]))
      .toEqual([[2, 1, 12, 2], [1, 1, 16, 1]]);
  });
});

describe('levelBand', () => {
  it('groups keys into +2-9, +10-14 and +15 and up', () => {
    expect([2, 9, 10, 14, 15, 25].map(levelBand)).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high']);
  });
});

describe('countTicks', () => {
  it('uses round steps that reach the maximum', () => {
    expect(countTicks(2505)).toEqual([0, 1000, 2000, 3000]);
    expect(countTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(countTicks(0)).toEqual([0, 1]);
  });
});

describe('runWeekType', () => {
  const runs = [
    run([9, 22, 20, 0], 12, 1500, [7, 1, 9], 'nl'),
    run([9, 23, 9, 40], 12, 1500, [8, 3, 10], 'nl'),
    run([9, 24, 9, 0], 3, 1500, [], 'nl'),
    run([9, 24, 9, 0], 16, 2000, [8, 3, 10], 'nl')
  ];
  const weeks = affixWeeks(runs);

  it('reads Fortified or Tyrannical from the run, or from its week for keys below +10', () => {
    expect(runs.map(r => runWeekType(r, weeks))).toEqual(['tyrannical', 'fortified', 'fortified', 'fortified']);
  });

  it('splits each key level by week type', () => {
    const rows = keyLevelSpread(runs, timers, weeks);
    expect(rows.filter(row => row.runs).map(row => [row.level, row.fortified, row.tyrannical]))
      .toEqual([[3, 1, 0], [12, 1, 1], [16, 1, 0]]);
  });

  it('splits each dungeon by week type with the highest timed key of each', () => {
    const [nl] = runsPerDungeon(runs, [dungeon('nl', 1800)], weeks);
    expect([nl.fortified, nl.tyrannical, nl.highestFortified, nl.highestTyrannical]).toEqual([3, 1, 12, 12]);
  });
});
