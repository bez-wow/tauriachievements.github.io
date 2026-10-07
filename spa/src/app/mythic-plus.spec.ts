import { describe, it, expect } from 'vitest';
import {
  characterKey,
  createRunDecoder,
  currentAffixWeek,
  formatClock,
  formatDuration,
  formatTimerDelta,
  keystoneUpgrades,
  memberNameMatches,
  pageCount,
  rankPlayers,
  rankRuns,
  runIncludesCharacter,
  runIncludesPlayer,
  scoreQuality,
  sortRoster,
  upgradeCutoffs,
  upgradeStars
} from './mythic-plus';

describe('upgradeStars', () => {
  it('draws one star per upgrade and none for a depleted key', () => {
    expect(upgradeStars(0)).toBe('');
    expect(upgradeStars(1)).toBe('★');
    expect(upgradeStars(2)).toBe('★★');
    expect(upgradeStars(3)).toBe('★★★');
  });
});

describe('currentAffixWeek', () => {
  const run = (completedAt: string, affixes: number[]) => ({ completedAt, affixes });
  const ms = (iso: string) => Date.parse(iso);

  it('takes the newest full affix set and starts the week after the last run of another week', () => {
    const week = currentAffixWeek([
      run('2026-09-29T20:00:00Z', [8, 3, 10]),
      run('2026-09-30T06:49:05Z', [8]),
      run('2026-09-30T07:40:57Z', [5, 4, 9]),
      run('2026-10-05T18:00:00Z', [5, 4, 9]),
      run('2026-10-05T19:00:00Z', [5])
    ]);

    expect(week).toEqual({ affixes: [5, 4, 9], since: ms('2026-09-30T06:49:05Z') + 1 });
  });

  it('places keys without affixes by time only', () => {
    const week = currentAffixWeek([
      run('2026-09-29T20:00:00Z', [8, 3, 10]),
      run('2026-09-30T05:00:00Z', []),
      run('2026-09-30T08:00:00Z', [5, 4, 9])
    ]);

    expect(week?.since).toBe(ms('2026-09-29T20:00:00Z') + 1);
  });

  it('covers the whole season while there has only been one week', () => {
    expect(currentAffixWeek([run('2026-09-16T12:00:00Z', [7, 1, 9])])?.since).toBe(1);
  });

  it('has no week until a run with all three affixes exists', () => {
    expect(currentAffixWeek([run('2026-09-16T12:00:00Z', [7])])).toBeUndefined();
    expect(currentAffixWeek([])).toBeUndefined();
  });
});

describe('keystoneUpgrades', () => {
  it('awards +3, +2 and +1 at the 60% / 80% / 100% cutoffs', () => {
    expect(keystoneUpgrades(1080, 1800)).toBe(3);
    expect(keystoneUpgrades(1081, 1800)).toBe(2);
    expect(keystoneUpgrades(1440, 1800)).toBe(2);
    expect(keystoneUpgrades(1441, 1800)).toBe(1);
    expect(keystoneUpgrades(1800, 1800)).toBe(1);
  });

  it('treats over-time and invalid runs as depleted', () => {
    expect(keystoneUpgrades(1801, 1800)).toBe(0);
    expect(keystoneUpgrades(0, 1800)).toBe(0);
    expect(keystoneUpgrades(1200, 0)).toBe(0);
  });
});

describe('upgradeCutoffs', () => {
  it('converts the cutoffs to seconds for a timer', () => {
    expect(upgradeCutoffs(2100)).toEqual([
      { upgrades: 3, percent: 60, seconds: 1260 },
      { upgrades: 2, percent: 80, seconds: 1680 },
      { upgrades: 1, percent: 100, seconds: 2100 }
    ]);
  });
});

describe('formatDuration', () => {
  it('formats a fixed-width hours:minutes:seconds clock', () => {
    expect(formatDuration(1747)).toBe('00:29:07');
    expect(formatDuration(3725)).toBe('01:02:05');
    expect(formatDuration(-5)).toBe('00:00:00');
  });
});

describe('formatClock', () => {
  it('omits the hour when under an hour', () => {
    expect(formatClock(59)).toBe('0:59');
    expect(formatClock(1747)).toBe('29:07');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('formatTimerDelta', () => {
  it('signs the distance from the timer', () => {
    expect(formatTimerDelta(1747, 2100)).toBe('-5:53');
    expect(formatTimerDelta(2230, 2100)).toBe('+2:10');
    expect(formatTimerDelta(2100, 2100)).toBe('0:00');
  });
});

describe('rankRuns', () => {
  it('orders by score, breaking ties with the faster clear', () => {
    const runs = [
      { id: 'a', score: 150, clearTimeSeconds: 1500 },
      { id: 'b', score: 180, clearTimeSeconds: 1900 },
      { id: 'c', score: 150, clearTimeSeconds: 1400 }
    ];

    expect(rankRuns(runs).map(run => run.id)).toEqual(['b', 'c', 'a']);
    expect(runs.map(run => run.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('scoreQuality', () => {
  it('maps the score relative to the best run onto item-quality tiers', () => {
    expect(scoreQuality(200, 200)).toBe('artifact');
    expect(scoreQuality(196, 200)).toBe('legendary');
    expect(scoreQuality(180, 200)).toBe('legendary');
    expect(scoreQuality(172, 200)).toBe('epic');
    expect(scoreQuality(160, 200)).toBe('rare');
    expect(scoreQuality(100, 200)).toBe('uncommon');
    expect(scoreQuality(100, 0)).toBe('uncommon');
  });
});

describe('runIncludesPlayer', () => {
  const run = { roster: [{ name: 'Björñ' }, { name: 'Llýnch' }, { name: 'Exa' }] };

  it('matches partial names ignoring case and accents', () => {
    expect(runIncludesPlayer(run, 'bjorn')).toBe(true);
    expect(runIncludesPlayer(run, 'LLYN')).toBe(true);
    expect(runIncludesPlayer(run, '  exa ')).toBe(true);
  });

  it('matches everything for an empty query and nothing for a stranger', () => {
    expect(runIncludesPlayer(run, '')).toBe(true);
    expect(runIncludesPlayer(run, 'Pretz')).toBe(false);
  });
});

describe('runIncludesCharacter', () => {
  const member = (name: string, realm = 'Tauri') =>
    ({ name, realm, class: 4, race: 1, gender: 0, spec: 'Outlaw', role: 'dps' as const });
  const run = (id: string, ...roster: ReturnType<typeof member>[]) =>
    ({ id, dungeon: 'hov', keyLevel: 10, clearTimeSeconds: 1500, score: 150, completedAt: '', affixes: [], roster });

  const runs = [
    run('nap', member('Nap'), member('Exa')),
    run('napim', member('Napim')),
    run('anapiel', member('Anapiel'), member('Exa')),
    run('other-realm', member('Nap', 'Evermoon')),
    run('both', member('Napim'), member('Nap'))
  ];

  it('keeps only runs of the clicked character, not of similar names or another realm', () => {
    // The player row carries the key rankPlayers gave it.
    const nap = rankPlayers(runs).find(player => player.member.name === 'Nap' && player.member.realm === 'Tauri');
    expect(nap?.key).toBe(characterKey(member('Nap')));

    const shown = runs.filter(candidate => runIncludesCharacter(candidate, nap!.key)).map(candidate => candidate.id);
    expect(shown).toEqual(['nap', 'both']);
  });

  it('leaves the typed search matching partial names', () => {
    expect(runs.filter(candidate => runIncludesPlayer(candidate, 'nap')).map(candidate => candidate.id))
      .toEqual(['nap', 'napim', 'anapiel', 'other-realm', 'both']);
  });
});

describe('sortRoster', () => {
  it('puts the tank and healer first and keeps DPS order', () => {
    const roster = [
      { name: 'A', role: 'dps' as const },
      { name: 'H', role: 'healer' as const },
      { name: 'B', role: 'dps' as const },
      { name: 'T', role: 'tank' as const }
    ];

    expect(sortRoster(roster).map(member => member.name)).toEqual(['T', 'H', 'A', 'B']);
  });
});

describe('createRunDecoder', () => {
  const index = {
    players: [
      ['Pashao', 'Evermoon', 'Хранители Вечности', 12, 4, 1],
      ['Swag', 'Tauri', '', 3, 22, 0]
    ] as Array<[string, string, string, number, number, number]>,
    specs: [
      { class: 3, name: 'Marksmanship', role: 'dps' as const },
      { class: 12, name: 'Vengeance', role: 'tank' as const }
    ]
  };

  it('expands a dungeon file into runs ranked in file order', () => {
    const decode = createRunDecoder(index);
    const [run] = decode({
      version: 1,
      dungeon: 'hov',
      runs: [[16, 1715363, 1790520370, 174.6, [8, 3, 10], [[0, 1], [1, 0]]]]
    });

    expect(run).toEqual({
      id: 'hov-1',
      dungeon: 'hov',
      keyLevel: 16,
      clearTimeSeconds: 1715.363,
      score: 174.6,
      completedAt: '2026-09-27T14:46:10.000Z',
      affixes: [8, 3, 10],
      roster: [
        { name: 'Pashao', realm: 'Evermoon', guild: 'Хранители Вечности', class: 12, race: 4, gender: 1, spec: 'Vengeance', role: 'tank' },
        { name: 'Swag', realm: 'Tauri', guild: undefined, class: 3, race: 22, gender: 0, spec: 'Marksmanship', role: 'dps' }
      ]
    });
  });

  it('shares one member object across runs and files, and skips unknown references', () => {
    const decode = createRunDecoder(index);
    const [first] = decode({ version: 1, dungeon: 'hov', runs: [[10, 1, 0, 100, [], [[0, 1], [9, 0], [1, 7]]]] });
    const [second] = decode({ version: 1, dungeon: 'eoa', runs: [[11, 1, 0, 110, [], [[0, 1]]]] });

    expect(first.roster).toHaveLength(1);
    expect(second.roster[0]).toBe(first.roster[0]);
  });
});

describe('rankPlayers', () => {
  const member = (name: string, spec = 'Blood') =>
    ({ name, realm: 'Evermoon', class: 6, race: 1, gender: 0, spec, role: 'tank' as const });
  const run = (id: string, dungeon: string, score: number, roster: ReturnType<typeof member>[], clearTimeSeconds = 1500) =>
    ({ id, dungeon, keyLevel: 10, clearTimeSeconds, score, completedAt: '', affixes: [], roster });

  it('sums the best run per dungeon, so farming one dungeon does not count twice', () => {
    const tank = member('Pretz');
    const [pretz] = rankPlayers([
      run('a', 'hov', 150, [tank]),
      run('b', 'hov', 170.1, [tank]),
      run('c', 'eoa', 160.2, [tank])
    ]);

    expect(pretz.score).toBe(330.3);
    expect(pretz.bestRuns.get('hov')?.id).toBe('b');
    expect(pretz.bestRuns.get('eoa')?.id).toBe('c');
  });

  it('ranks by score, then name, and counts every spec of a character as one player', () => {
    const ranked = rankPlayers([
      run('a', 'hov', 180, [member('Pashao', 'Vengeance'), member('Bea')]),
      run('b', 'eoa', 190, [member('Pashao', 'Havoc')]),
      run('c', 'hov', 180, [member('Abe')])
    ]);

    expect(ranked.map(player => [player.member.name, player.score])).toEqual([
      ['Pashao', 370], ['Abe', 180], ['Bea', 180]
    ]);
    // Shown with the spec of their highest run.
    expect(ranked[0].member.spec).toBe('Havoc');
  });

  it('scores a spec filter on the runs played as that spec only', () => {
    const ranked = rankPlayers([
      run('a', 'hov', 180, [member('Pashao', 'Vengeance'), member('Bea')]),
      run('b', 'eoa', 190, [member('Pashao', 'Havoc')])
    ], candidate => candidate.spec === 'Vengeance');

    expect(ranked.map(player => [player.member.name, player.score])).toEqual([['Pashao', 180]]);
  });
});

describe('memberNameMatches', () => {
  it('matches like the run search', () => {
    expect(memberNameMatches({ name: 'Björñ' }, 'bjorn')).toBe(true);
    expect(memberNameMatches({ name: 'Björñ' }, '')).toBe(true);
    expect(memberNameMatches({ name: 'Björñ' }, 'pretz')).toBe(false);
  });
});

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });
});
