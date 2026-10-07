import { describe, expect, it } from 'vitest';
import { MythicPlusMember, MythicPlusRun, characterKey, rankPlayers } from './mythic-plus';
import {
  characterParam,
  characterProfileLink,
  findCharacters,
  formatTopPercent,
  frequentTeammates,
  pageOfRank,
  parseCharacterParam,
  scopeRank,
  scoreOverTime,
  specsPlayed
} from './mythic-plus-profile';

function member(name: string, overrides: Partial<MythicPlusMember> = {}): MythicPlusMember {
  return { name, realm: 'Evermoon', class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps', ...overrides };
}

/** A local date and time, so day grouping is the same in every time zone. */
const at = (month: number, day: number, hour = 20) => new Date(2026, month - 1, day, hour).toISOString();

let nextId = 0;
function run(dungeon: string, score: number, roster: MythicPlusMember[], completedAt = at(9, 20), clearTimeSeconds = 1500): MythicPlusRun {
  return { id: `${dungeon}-${++nextId}`, dungeon, keyLevel: 15, clearTimeSeconds, score, completedAt, affixes: [], roster };
}

describe('profile links', () => {
  it('builds the profile path from the realm slug and the name as it is', () => {
    expect(characterProfileLink(member('Táncoslány', { realm: 'Tauri' })))
      .toEqual(['/mythic-plus', 'character', 'tauri', 'Táncoslány']);
    expect(characterProfileLink(member('Stronoff', { realm: 'WoD' }))[2]).toBe('wod');
  });

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
  // Frost 350, Blood 300, Monk 250 overall; only 150 of Frost's score comes from playing Blood.
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
    expect(scopeRank(ranking, characterKey(monk))).toEqual({ rank: 3, total: 3 });
    expect(scopeRank(ranking, characterKey(monk), player => player.member.realm === 'Evermoon')).toEqual({ rank: 2, total: 2 });
    expect(scopeRank(ranking, characterKey(blood), player => player.member.class === 6)).toEqual({ rank: 2, total: 2 });
  });

  it('ranks a spec on the runs played as that spec only, as the ?class=&spec= players view does', () => {
    const bloodRanking = rankPlayers(runs, entry => entry.class === 6 && entry.spec === 'Blood');
    expect(scopeRank(bloodRanking, key)).toEqual({ rank: 2, total: 2 });
    expect(bloodRanking.find(player => player.key === key)?.score).toBe(150);
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
    // Not one of mine: neither its count nor its key may leak into the teammates.
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
