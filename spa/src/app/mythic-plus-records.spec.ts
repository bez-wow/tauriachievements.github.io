import { describe, expect, it } from 'vitest';
import { MythicPlusDungeon, MythicPlusMember, MythicPlusRun } from './mythic-plus';
import { dungeonTimers } from './mythic-plus-activity';
import {
  CLAIM_SHOWN_FOR_MS,
  bestTimedRun,
  compareRecords,
  dungeonBounties,
  dungeonRecords,
  formatHeldFor,
  openBounty,
  runsOnRealm,
  serverFirsts
} from './mythic-plus-records';

function dungeon(id: string, timerSeconds: number): MythicPlusDungeon {
  return { id, challengeId: 0, shortName: id.toUpperCase(), name: id, timerSeconds, icon: '', runCount: 0, bestScore: 0 };
}

const dungeons = [dungeon('nl', 1980), dungeon('mos', 1440), dungeon('hov', 2700)];
const timers = dungeonTimers(dungeons);

function member(name: string, realm = 'Evermoon'): MythicPlusMember {
  return { name, realm, class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps' };
}

let nextId = 0;
/** A run of `dungeonId` at `keyLevel`, `clear` seconds long, finished `day` days into the season. */
function run(dungeonId: string, keyLevel: number, clear: number, day: number, roster = [member('Progtrix')]): MythicPlusRun {
  return {
    id: `${dungeonId}-${++nextId}`,
    dungeon: dungeonId,
    keyLevel,
    clearTimeSeconds: clear,
    score: 0,
    completedAt: new Date(Date.UTC(2026, 8, 16) + day * 86400000).toISOString(),
    affixes: [],
    roster
  };
}

const NOW = Date.UTC(2026, 9, 7);

describe('compareRecords', () => {
  it('ranks the higher key first, then the faster clear, then the earlier one', () => {
    const fast = run('nl', 18, 1500, 3);
    const slow = run('nl', 18, 1700, 1);
    const fastLater = run('nl', 18, 1500, 5);
    const higher = run('nl', 19, 1900, 9);

    expect([fastLater, slow, higher, fast].sort(compareRecords)).toEqual([higher, fast, fastLater, slow]);
  });
});

describe('bestTimedRun', () => {
  it('skips keys that ran out of time, however high', () => {
    const timed = run('mos', 17, 1174, 10);
    expect(bestTimedRun([run('mos', 18, 1453, 12), timed, run('mos', 12, 900, 2)], timers)).toBe(timed);
  });

  it('has nothing when no run was timed', () => {
    expect(bestTimedRun([run('mos', 18, 1453, 12)], timers)).toBeUndefined();
  });
});

describe('dungeonRecords', () => {
  it('holds the highest timed key of each dungeon, highest record first', () => {
    const nl = run('nl', 19, 1797, 19);
    const mosFast = run('mos', 17, 1174, 10);
    const runs = [run('nl', 18, 1500, 3), nl, run('nl', 20, 2100, 20), run('mos', 17, 1300, 5), mosFast, run('mos', 18, 1453, 12)];

    expect(dungeonRecords(runs, dungeons)).toEqual([
      { dungeon: dungeons[0], run: nl },
      { dungeon: dungeons[1], run: mosFast },
      { dungeon: dungeons[2], run: undefined }
    ]);
  });

  it('puts the record that used less of its timer first at the same key', () => {
    // 1300 of 1980 s (66%) against 1000 of 1440 s (69%).
    const nl = run('nl', 17, 1300, 1);
    const mos = run('mos', 17, 1000, 1);
    expect(dungeonRecords([mos, nl], dungeons).map(record => record.run)).toEqual([nl, mos, undefined]);
  });
});

describe('serverFirsts', () => {
  it('lists the first timed run at each level from +10 up, highest level first', () => {
    const first16 = run('nl', 16, 1900, 4);
    const first15 = run('mos', 15, 1400, 0);
    const runs = [
      run('nl', 16, 1500, 6),
      first16,
      run('nl', 17, 2500, 3), // over time
      first15,
      run('hov', 15, 2000, 2),
      run('mos', 9, 1000, 0) // below +10
    ];

    expect(serverFirsts(runs, timers)).toEqual([{ level: 16, run: first16 }, { level: 15, run: first15 }]);
  });

  it('leaves out a level nobody has timed and keeps the exact level of each run', () => {
    const runs = [run('nl', 12, 1500, 0), run('nl', 14, 1500, 1)];
    expect(serverFirsts(runs, timers).map(first => first.level)).toEqual([14, 12]);
  });

  it('gives a tie in the same second to the faster clear', () => {
    const slow = run('nl', 15, 1900, 3);
    const fast = run('nl', 15, 1600, 3);
    expect(serverFirsts([slow, fast], timers)[0].run).toBe(fast);
  });
});

describe('openBounty', () => {
  const mosRuns = [
    run('mos', 17, 1174, 10),
    run('mos', 17, 1100, 5), // the first +17 timed: it claimed the +17 bounty
    run('mos', 18, 1453, 12), // 13 s over
    run('mos', 19, 1600, 13), // 160 s over
    run('mos', 18, 1500, 14) // 60 s over
  ];
  const mosNow = Date.parse(mosRuns[1].completedAt) + CLAIM_SHOWN_FOR_MS;

  it('is one above the highest timed key, with every attempt and the closest one', () => {
    expect(openBounty(mosRuns, timers, NOW)).toEqual({ level: 18, attempts: 3, closest: mosRuns[2], claimed: undefined });
  });

  it('shows who claimed the level below for a week after they did', () => {
    expect(openBounty(mosRuns, timers, mosNow).claimed).toBe(mosRuns[1]);
    expect(openBounty(mosRuns, timers, mosNow + 1).claimed).toBeUndefined();
  });

  it('prefers the higher key when two attempts missed by the same share of the timer', () => {
    const low = run('nl', 20, 2100, 1);
    const high = run('nl', 21, 2100, 2);
    expect(openBounty([run('nl', 19, 1797, 0), low, high], timers, NOW).closest).toBe(high);
  });

  it('starts at the lowest key when nothing was timed', () => {
    expect(openBounty([], timers, NOW)).toEqual({ level: 2, attempts: 0, closest: undefined, claimed: undefined });
    expect(openBounty([run('hov', 4, 3000, 0)], timers, NOW)).toEqual({
      level: 2, attempts: 1, closest: expect.objectContaining({ keyLevel: 4 }), claimed: undefined
    });
  });

  it('works across dungeons, measuring each attempt against its own timer', () => {
    // 1490 of 1440 s is 3.5% over; 2020 of 1980 s only 2%.
    const mos = run('mos', 21, 1490, 3);
    const nl = run('nl', 21, 2020, 4);
    const bounty = openBounty([run('nl', 20, 1900, 1), mos, nl], timers, NOW);
    expect(bounty.level).toBe(21);
    expect(bounty.closest).toBe(nl);
  });
});

describe('dungeonBounties', () => {
  it('lists the lowest open level first, then the closest attempt, then the untried', () => {
    const runs = [
      run('nl', 19, 1797, 0),
      run('nl', 20, 2400, 1),
      run('mos', 19, 1400, 0),
      run('mos', 20, 1450, 1),
      run('hov', 16, 1715, 0)
    ];

    expect(dungeonBounties(runs, dungeons, NOW).map(bounty => [bounty.dungeon.id, bounty.level, bounty.attempts]))
      .toEqual([['hov', 17, 0], ['mos', 20, 1], ['nl', 20, 1]]);
  });
});

describe('runsOnRealm', () => {
  it('keeps only the WoD leaderboard runs for WoD', () => {
    const evermoon = run('nl', 15, 1500, 0, [member('Progtrix'), member('Healer', 'Tauri')]);
    const wod = run('nl', 15, 1500, 0, [member('Arrchangel', 'WoD')]);

    expect(runsOnRealm([evermoon, wod], 'wod')).toEqual([wod]);
    expect(runsOnRealm([evermoon, wod], 'all')).toEqual([evermoon, wod]);
  });
});

describe('formatHeldFor', () => {
  const set = Date.UTC(2026, 8, 26, 14);

  it('counts whole days, then hours', () => {
    expect(formatHeldFor(set, set + 11.5 * 86400000)).toBe('held for 11 days');
    expect(formatHeldFor(set, set + 86400000)).toBe('held for 1 day');
    expect(formatHeldFor(set, set + 5 * 3600000)).toBe('held for 5 hours');
    expect(formatHeldFor(set, set + 3600000)).toBe('held for 1 hour');
    expect(formatHeldFor(set, set + 60000)).toBe('set in the last hour');
    expect(formatHeldFor(set, set - 60000)).toBe('set in the last hour');
  });
});
