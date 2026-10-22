import { describe, expect, it } from 'vitest';
import { MythicPlusIndex, MythicPlusMember, MythicPlusRun, characterKey, playerRanks, rankPlayers } from './mythic-plus';
import {
  characterParam,
  findCharacters,
  formatTopPercent,
  frequentTeammates,
  pageOfRank,
  parseCharacterParam,
  profileScanChange,
  rankChangeLabel,
  runSummary,
  runTimeSpan,
  scopeRank,
  scoreChangeLabel,
  scoreChart,
  scoreOverTime,
  specsPlayed
} from './mythic-plus-profile';

function member(name: string, overrides: Partial<MythicPlusMember> = {}): MythicPlusMember {
  return { name, realm: 'Evermoon', class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps', ...overrides };
}

const at = (month: number, day: number, hour = 20) => new Date(2026, month - 1, day, hour).toISOString();

let nextId = 0;
function run(dungeon: string, score: number, roster: MythicPlusMember[], completedAt = at(9, 20), clearTimeSeconds = 1500): MythicPlusRun {
  return { id: `${dungeon}-${++nextId}`, dungeon, keyLevel: 15, clearTimeSeconds, score, completedAt, affixes: [], roster };
}

describe('profile links', () => {
  it('writes and reads the leaderboard character parameter', () => {
    expect(characterParam(member('Progtrix'))).toBe('Progtrix-Evermoon');
    expect(parseCharacterParam('Progtrix-Evermoon')).toEqual({ name: 'Progtrix', realm: 'Evermoon' });
    expect(parseCharacterParam('M#2124685-WoD')).toEqual({ name: 'M#2124685', realm: 'WoD' });
  });

  it('ignores a character parameter without both a name and a realm', () => {
    expect(parseCharacterParam(null)).toBeUndefined();
    expect(parseCharacterParam('Progtrix')).toBeUndefined();
    expect(parseCharacterParam('-Evermoon')).toBeUndefined();
    expect(parseCharacterParam('Progtrix-')).toBeUndefined();
  });
});

describe('findCharacters', () => {
  const characters = [
    member('Progtrix'),
    member('Nicole'),
    member('Nicole', { realm: 'Tauri' }),
    member('Táncoslány', { realm: 'Tauri' }),
    member('Алисица')
  ];

  it('matches the name exactly on the realm the URL names', () => {
    expect(findCharacters(characters, 'evermoon', 'Progtrix')).toEqual([characters[0]]);
    expect(findCharacters(characters, 'tauri', 'Nicole')).toEqual([characters[2]]);
  });

  it('falls back to a case-insensitive match, including accented and Cyrillic names', () => {
    expect(findCharacters(characters, 'Evermoon', 'progtrix')).toEqual([characters[0]]);
    expect(findCharacters(characters, 'tauri', 'TÁNCOSLÁNY')).toEqual([characters[3]]);
    expect(findCharacters(characters, 'evermoon', 'алисица')).toEqual([characters[4]]);
  });

  it('matches a name typed with combining accents', () => {
    expect(findCharacters(characters, 'tauri', 'Táncoslány'.normalize('NFD'))).toEqual([characters[3]]);
  });

  it('lists every character a case-insensitive match finds', () => {
    const twins = [member('Lili'), member('LILI'), member('Lilith')];
    expect(findCharacters(twins, 'evermoon', 'lili')).toEqual([twins[0], twins[1]]);
    expect(findCharacters(twins, 'evermoon', 'Lili')).toEqual([twins[0]]);
  });

  it('finds no one on another realm or for a partial name', () => {
    expect(findCharacters(characters, 'wod', 'Progtrix')).toEqual([]);
    expect(findCharacters(characters, 'evermoon', 'Prog')).toEqual([]);
  });
});

describe('ranks', () => {
  const blood = member('Blood', { class: 6, spec: 'Blood', role: 'tank' });
  const frost = member('Frost', { class: 6, spec: 'Frost', realm: 'Tauri' });
  const monk = member('Monk');
  const runs = [
    run('nl', 150, [blood, monk]),
    run('dht', 150, [blood]),
    run('eoa', 100, [monk]),
    run('nl', 200, [frost]),
    run('dht', 150, [{ ...frost, spec: 'Blood', role: 'tank' }])
  ];
  const ranking = rankPlayers(runs);
  const key = characterKey(frost);

  it('ranks a character overall, on their realm and in their class', () => {
    expect(ranking.map(player => player.key)).toEqual(['Frost|Tauri', 'Blood|Evermoon', 'Monk|Evermoon']);
    expect(scopeRank(ranking, characterKey(monk))).toEqual({ rank: 3, position: 3, total: 3 });
    expect(scopeRank(ranking, characterKey(monk), player => player.member.realm === 'Evermoon')).toEqual({ rank: 2, position: 2, total: 2 });
    expect(scopeRank(ranking, characterKey(blood), player => player.member.class === 6)).toEqual({ rank: 2, position: 2, total: 2 });
  });

  it('ranks a spec on the runs played as that spec only, as the ?class=&spec= players view does', () => {
    const bloodRanking = rankPlayers(runs, entry => entry.class === 6 && entry.spec === 'Blood');
    expect(scopeRank(bloodRanking, key)).toEqual({ rank: 2, position: 2, total: 2 });
    expect(bloodRanking.find(player => player.key === key)?.score).toBe(150);
  });

  it('shares a rank only on the same score and the same total time', () => {
    const [a, b, c, d, e] = ['A', 'B', 'C', 'D', 'E'].map(name => member(name));
    const tied = rankPlayers([
      run('nl', 200, [a, b, c], at(9, 20), 1500),
      run('nl', 200, [d], at(9, 20), 1600),
      run('nl', 150, [e])
    ]);
    expect(tied.map(player => player.member.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(playerRanks(tied)).toEqual([1, 1, 1, 4, 5]);
    expect(scopeRank(tied, characterKey(c))).toEqual({ rank: 1, position: 3, total: 5 });
    expect(scopeRank(tied, characterKey(d))).toEqual({ rank: 4, position: 4, total: 5 });
    expect(scopeRank(tied, characterKey(e))).toEqual({ rank: 5, position: 5, total: 5 });
    expect(scopeRank(tied, characterKey(d), player => player.member.name !== 'E')).toEqual({ rank: 4, position: 4, total: 4 });
  });

  it('has no rank for a character outside the scope', () => {
    expect(scopeRank(ranking, characterKey(monk), player => player.member.class === 6)).toBeUndefined();
    expect(scopeRank(ranking, 'Nobody|Evermoon')).toBeUndefined();
  });

  it('rounds the percentile up, to tenths below 10%', () => {
    expect(formatTopPercent({ rank: 23, total: 1000 })).toBe('top 2.3%');
    expect(formatTopPercent({ rank: 1, total: 11102 })).toBe('top 0.1%');
    expect(formatTopPercent({ rank: 1, total: 87 })).toBe('top 1.2%');
    expect(formatTopPercent({ rank: 123, total: 1000 })).toBe('top 13%');
    expect(formatTopPercent({ rank: 87, total: 87 })).toBe('top 100%');
  });

  it('finds the leaderboard page that shows a rank', () => {
    expect(pageOfRank(1, 50)).toBe(1);
    expect(pageOfRank(50, 50)).toBe(1);
    expect(pageOfRank(51, 50)).toBe(2);
    expect(pageOfRank(51, 25)).toBe(3);
  });
});

describe('scoreOverTime', () => {
  const me = member('Progtrix');

  it('replays the runs day by day, keeping the best run per dungeon', () => {
    const days = scoreOverTime([
      run('nl', 120, [me], at(9, 17)),
      run('nl', 110, [me], at(9, 17, 22)),
      run('dht', 100, [me], at(9, 19)),
      run('nl', 140.3, [me], at(9, 19, 23))
    ], Date.parse(at(9, 16, 9)), Date.parse(at(9, 20, 9)));

    expect(days).toEqual([
      { day: '2026-09-16', score: 0, gained: 0, runs: 0 },
      { day: '2026-09-17', score: 120, gained: 120, runs: 2 },
      { day: '2026-09-18', score: 120, gained: 0, runs: 0 },
      { day: '2026-09-19', score: 240.3, gained: 120.3, runs: 2 },
      { day: '2026-09-20', score: 240.3, gained: 0, runs: 0 }
    ]);
  });

  it('replays in finishing order whatever order the runs come in', () => {
    const runs = [run('nl', 150, [me], at(9, 18)), run('nl', 100, [me], at(9, 17))];
    expect(scoreOverTime(runs, Date.parse(at(9, 17)), Date.parse(at(9, 18))).map(day => day.score)).toEqual([100, 150]);
  });

  it('ends on the player score rankPlayers gives', () => {
    const mate = member('Mate');
    const runs = [
      run('nl', 150.1, [me, mate], at(9, 17)),
      run('dht', 133.7, [me], at(9, 18)),
      run('eoa', 99.9, [me, mate], at(9, 25)),
      run('dht', 120.2, [me], at(9, 26))
    ];
    const days = scoreOverTime(runs, Date.parse(at(9, 16)), Date.parse(at(9, 30)));

    expect(days.length).toBe(15);
    expect(days[days.length - 1].score).toBe(rankPlayers(runs).find(player => player.key === characterKey(me))?.score);
  });

  it('counts runs from before the first day on the first day', () => {
    const days = scoreOverTime([run('nl', 100, [me], at(9, 10))], Date.parse(at(9, 16)), Date.parse(at(9, 17)));
    expect(days[0]).toEqual({ day: '2026-09-16', score: 100, gained: 100, runs: 1 });
  });

  it('is empty for a range that ends before it starts', () => {
    expect(scoreOverTime([], Date.parse(at(9, 17)), Date.parse(at(9, 16)))).toEqual([]);
  });
});

describe('frequentTeammates', () => {
  const me = member('Progtrix');
  const tank = member('Tank', { class: 6, spec: 'Blood', role: 'tank' });
  const healer = member('Healer', { class: 5, spec: 'Holy', role: 'healer' });
  const other = member('Other');
  const stranger = member('Stranger');

  const runs = [
    run('nl', 150, [tank, healer, me]),
    run('dht', 170, [tank, me], at(9, 21), 1600),
    run('dht', 170, [{ ...tank, spec: 'Frost', role: 'dps' }, me], at(9, 22), 1400),
    run('eoa', 120, [healer, other, me]),
    run('cos', 200, [tank, stranger])
  ];

  it('counts shared runs, most first, then by the best run together', () => {
    const teammates = frequentTeammates(runs, characterKey(me), 10);

    expect(teammates.map(mate => [mate.member.name, mate.runs])).toEqual([['Tank', 3], ['Healer', 2], ['Other', 1]]);
    expect(teammates.find(mate => mate.member.name === 'Stranger')).toBeUndefined();
  });

  it('keeps the best run together, a faster clear breaking a tie, and the teammate as they played it', () => {
    const tankmate = frequentTeammates(runs, characterKey(me), 10)[0];

    expect(tankmate.bestRun.clearTimeSeconds).toBe(1400);
    expect(tankmate.member.spec).toBe('Frost');
  });

  it('stops at the limit', () => {
    expect(frequentTeammates(runs, characterKey(me), 2).map(mate => mate.member.name)).toEqual(['Tank', 'Healer']);
  });

  it('finds no teammates for a character without runs', () => {
    expect(frequentTeammates(runs, 'Nobody|Evermoon', 10)).toEqual([]);
  });
});

describe('specsPlayed', () => {
  it('puts the top run spec first, then the most played', () => {
    const me = member('Progtrix');
    const runs = [
      run('nl', 100, [{ ...me, spec: 'Mistweaver', role: 'healer' }]),
      run('nl', 110, [{ ...me, spec: 'Mistweaver', role: 'healer' }]),
      run('dht', 90, [{ ...me, spec: 'Brewmaster', role: 'tank' }]),
      run('eoa', 180, [me])
    ];

    expect(specsPlayed(runs, characterKey(me), 'Windwalker')).toEqual([
      { class: 10, spec: 'Windwalker', runs: 1 },
      { class: 10, spec: 'Mistweaver', runs: 2 },
      { class: 10, spec: 'Brewmaster', runs: 1 }
    ]);
  });
});

describe('profileScanChange', () => {
  const index: MythicPlusIndex = {
    version: 1,
    season: { id: 'legion-s1', name: 'Legion Season 1', raid: 'Emerald Nightmare', startDate: '2026-09-16' },
    dungeons: [],
    affixes: [],
    specs: [],
    previousGeneratedAt: '2026-10-07T09:30:00Z',
    players: [['Exkeito', 'Evermoon', '', 11, 4, 0], ['Napim', 'Tauri', '', 11, 4, 0]],
    standings: [[196, 1, 4.5, 2], [160, 2]]
  };

  it('reads the change since the last scan, or that the character is new to the ladder', () => {
    expect(profileScanChange(index, 'Exkeito|Evermoon')).toEqual({ score: 4.5, rank: 2, isNew: false });
    expect(profileScanChange(index, 'Napim|Tauri')).toEqual({ isNew: true });
    expect(profileScanChange(index, 'Nobody|Tauri')).toBeUndefined();
    expect(profileScanChange({ ...index, previousGeneratedAt: undefined }, 'Exkeito|Evermoon')).toBeUndefined();
  });
});

describe('change labels', () => {
  it('says how the rank and the score moved since the last scan', () => {
    expect(rankChangeLabel(1)).toBe('Climbed 1 rank since the last scan');
    expect(rankChangeLabel(-3)).toBe('Fell 3 ranks since the last scan');
    expect(rankChangeLabel(0)).toBe('Rank unchanged since the last scan');
    expect(scoreChangeLabel(4.5)).toBe('+4.5 score since the last scan');
    expect(scoreChangeLabel(-2)).toBe('−2.0 score since the last scan');
    expect(scoreChangeLabel(0)).toBe('0.0 score since the last scan');
  });
});

describe('runSummary', () => {
  const dungeons = [{ id: 'cos', timerSeconds: 1800 }];

  it('counts the runs, the share in time and the highest timed key', () => {
    const runs = [
      { dungeon: 'cos', keyLevel: 15, clearTimeSeconds: 1500 },
      { dungeon: 'cos', keyLevel: 18, clearTimeSeconds: 1900 },
      { dungeon: 'cos', keyLevel: 12, clearTimeSeconds: 1000 }
    ];
    expect(runSummary(runs, dungeons)).toEqual([
      { label: 'Runs', value: '3' },
      { label: 'In time', value: '67%' },
      { label: 'Highest timed key', value: '+15' }
    ]);
  });

  it('shows a dash for the highest key when nothing was timed', () => {
    expect(runSummary([], dungeons).map(stat => stat.value)).toEqual(['0', '0%', '-']);
  });
});

describe('runTimeSpan', () => {
  it('finds the first and the last finish', () => {
    expect(runTimeSpan([{ completedAt: '2026-10-02T00:00:00Z' }, { completedAt: '2026-09-20T00:00:00Z' }]))
      .toEqual({ first: Date.parse('2026-09-20T00:00:00Z'), last: Date.parse('2026-10-02T00:00:00Z') });
  });
});

describe('scoreChart', () => {
  const tyrannical = { id: 9, name: 'Tyrannical', level: 4, icon: '', description: '' };
  const weeks = [
    { since: new Date(2026, 8, 16).getTime(), affixes: [9] },
    { since: new Date(2026, 8, 23).getTime(), affixes: [] }
  ];
  const days = [
    { day: '2026-09-20', score: 100, gained: 100, runs: 1 },
    { day: '2026-09-21', score: 100, gained: 0, runs: 0 },
    { day: '2026-09-24', score: 250.5, gained: 150.5, runs: 2 }
  ];

  it('has no chart without days', () => {
    expect(scoreChart([], weeks, new Map(), 12)).toBeUndefined();
  });

  it('groups the days into affix weeks and labels every few days', () => {
    const chart = scoreChart(days, weeks, new Map([[9, tyrannical]]), 2);

    expect(chart?.bands).toEqual([
      { start: 1, span: 2, affixes: [tyrannical], shade: false },
      { start: 3, span: 1, affixes: [], shade: true }
    ]);
    expect(chart?.points.map(point => point.showLabel)).toEqual([true, false, true]);
    expect(chart?.points.map(point => point.flip)).toEqual([false, false, true]);
    expect(chart?.points.map(point => point.middle)).toEqual([false, true, false]);
    expect(chart?.viewBox).toBe('0 0 3 100');
  });

  it('describes each day for screen readers', () => {
    const chart = scoreChart(days, weeks, new Map(), 12);

    expect(chart?.points.map(point => point.ariaLabel)).toEqual([
      'Sunday 20 September: 100.0 points, 1 run, +100.0',
      'Monday 21 September: 100.0 points',
      'Thursday 24 September: 250.5 points, 2 runs, +150.5'
    ]);
  });
});
