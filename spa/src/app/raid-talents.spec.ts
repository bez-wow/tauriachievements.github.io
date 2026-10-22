import { describe, expect, it } from 'vitest';
import { RaidBoss, RaidCharacter, RaidDifficulty, RaidKillDetails, RaidMember, RaidSpec, RaidTalentTable, RoleFilter } from './raid-logs';
import {
  TalentSample,
  agreementLabel,
  bossTalentShares,
  buildTalents,
  formatPoints,
  formatShare,
  mostContestedTier,
  mostSettledTier,
  notablePicks,
  sortByPerformance,
  specTalentSummaries,
  specTiers,
  specsMatching,
  talentAgreement,
  talentBuilds,
  talentLevels,
  talentPicks,
  talentSamples,
  talentSwaps,
  topPlayerCount,
  topPlayerEdge
} from './raid-talents';

const boss = (index: number, slug: string): RaidBoss => ({ id: index, slug, name: slug, shortName: slug, index, portrait: '' });
const nythendra = boss(0, 'nythendra');
const ursoc = boss(1, 'ursoc');
const heroic: RaidDifficulty = { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 1 };

const fire: RaidSpec = { id: 63, classId: 8, name: 'Fire', role: 'dps' };
const holy: RaidSpec = { id: 65, classId: 2, name: 'Holy', role: 'healer' };

const characters = new Map<string, RaidCharacter>();
function character(name: string, classId = 8): RaidCharacter {
  let known = characters.get(name);
  if (!known) {
    known = { name, realm: 'Tauri', classId, race: 1, gender: 0, guild: '' };
    characters.set(name, known);
  }
  return known;
}

function member(name: string, spec: RaidSpec | undefined, talents: string, dps: number, hps = 0): RaidMember {
  return {
    character: character(name, spec?.classId),
    spec,
    itemLevel: 870,
    damage: 0,
    healing: 0,
    absorbs: 0,
    overhealing: 0,
    damageTaken: 0,
    interrupts: 0,
    dispels: 0,
    dps,
    hps,
    talents,
    trinkets: []
  };
}

let logId = 0;
function kill(raidBoss: RaidBoss, killedAt: number, members: RaidMember[]): RaidKillDetails {
  return {
    realm: 'Tauri', logId: ++logId, boss: raidBoss, difficulty: heroic, killedAt, fightMs: 300_000,
    faction: 0, wipes: 0, deaths: 0, resurrects: 0, items: [], members
  };
}

const talent = (id: number) => ({ id, name: `Talent ${id}`, icon: `icon_${id}` });
// Fire's table: tier t, column c is talent 10t + c.
const table: RaidTalentTable = new Map([[63, Array.from({ length: 7 }, (_, tier) => [0, 1, 2].map(column => talent(tier * 10 + column)))]]);

describe('talentSamples', () => {
  it('keeps each character\'s best kill per boss and spec, and ranks the spec on each boss', () => {
    const samples = talentSamples([
      kill(nythendra, 1, [member('Alpha', fire, '0000000', 100), member('Beta', fire, '1111111', 300), member('Healz', holy, '2222222', 10, 500)]),
      kill(nythendra, 2, [member('Alpha', fire, '2222222', 400), member('Beta', fire, '1111111', 200)]),
      kill(ursoc, 3, [member('Alpha', fire, '0000000', 50)])
    ]);

    const alpha = samples.filter(sample => sample.character.name === 'Alpha');
    expect(alpha.map(sample => [sample.boss.slug, sample.talents, sample.value])).toEqual([
      ['nythendra', '2222222', 400],
      ['ursoc', '0000000', 50]
    ]);

    const nythendraFire = samples.filter(sample => sample.boss === nythendra && sample.spec === fire);
    expect(nythendraFire.map(sample => [sample.character.name, sample.rank, sample.isTop, sample.relative])).toEqual([
      ['Alpha', 1, true, 1],
      ['Beta', 2, false, .75]
    ]);

    // Healers are measured on healing.
    expect(samples.find(sample => sample.spec === holy)?.value).toBe(500);
  });

  it('leaves out members without a spec or talents', () => {
    const samples = talentSamples([kill(nythendra, 1, [member('Alpha', undefined, '0000000', 100), member('Beta', fire, '', 300)])]);
    expect(samples).toEqual([]);
  });

  it('counts a tenth of a ranking, rounded up, as its top players', () => {
    expect([0, 1, 9, 10, 11, 25].map(topPlayerCount)).toEqual([0, 1, 1, 1, 2, 3]);
  });
});

describe('talentPicks', () => {
  const sample = (talents: string, isTop = false): TalentSample => ({ talents, isTop, key: talents + isTop } as TalentSample);
  const tiers = specTiers(table, fire);
  const picks = talentPicks([
    sample('0000000', true),
    sample('0100000'),
    sample('1200000'),
    sample('1.00000')
  ], tiers, talentLevels(8));

  it('shares each tier\'s picks among its talents, for everyone and the top players', () => {
    expect(picks.picks).toBe(4);
    expect(picks.topPicks).toBe(1);
    expect(picks.tiers[0].choices.map(choice => [choice.talent?.id, choice.share, choice.topShare])).toEqual([
      [0, .5, 1],
      [1, .5, 0],
      [2, 0, 0]
    ]);
    expect(picks.tiers[1].none).toBe(1);
    expect(picks.tiers[1].choices.map(choice => choice.count)).toEqual([1, 1, 1]);
    expect(picks.tiers.map(tier => tier.level)).toEqual([15, 30, 45, 60, 75, 90, 100]);
  });

  it('leads each tier with its most picked talent, the leftmost on a tie', () => {
    expect(picks.tiers[0].leader?.column).toBe(0);
    expect(picks.tiers[1].leader?.column).toBe(0);
    expect(picks.tiers[2].leader?.share).toBe(1);
  });

  it('measures agreement and finds the most and least agreed tiers', () => {
    expect(talentAgreement(picks)).toBeCloseTo((.5 + .25 + 1 * 5) / 7);
    expect(mostContestedTier(picks)?.tier).toBe(1);
    expect(mostSettledTier(picks)?.tier).toBe(2);
    expect([.85, .8, .797, .7, .65, .6].map(agreementLabel)).toEqual(['Settled', 'Settled', 'Settled', 'Mixed', 'Mixed', 'Wide open']);
  });

  it('starts Death Knight and Demon Hunter tiers at their own levels', () => {
    expect(talentLevels(6)[0]).toBe(56);
    expect(talentLevels(12)).toEqual([99, 100, 102, 104, 106, 108, 110]);
  });
});

describe('topPlayerEdge', () => {
  const tierOf = (share: number, topShare: number) => ({
    tier: 0,
    level: 15,
    none: 0,
    choices: [{ column: 0, count: 1, share, topCount: 1, topShare }, { column: 1, count: 1, share: 1 - share, topCount: 1, topShare: 1 - topShare }]
  });

  it('finds the talent the top players favour most, and the one they skip most', () => {
    const picks = { picks: 100, topPicks: 10, characters: 100, tiers: [tierOf(.5, .8), tierOf(.4, .45)] };
    expect(topPlayerEdge(picks, 'more')).toMatchObject({ choice: { column: 0 }, difference: expect.closeTo(.3) });
    expect(topPlayerEdge(picks, 'less')).toMatchObject({ choice: { column: 1 }, difference: expect.closeTo(-.3) });
  });

  it('says nothing without five top picks or a five-point difference', () => {
    expect(topPlayerEdge({ picks: 40, topPicks: 4, characters: 40, tiers: [tierOf(.5, .8)] }, 'more')).toBeUndefined();
    expect(topPlayerEdge({ picks: 100, topPicks: 10, characters: 100, tiers: [tierOf(.5, .52)] }, 'more')).toBeUndefined();
  });
});

describe('talentBuilds', () => {
  it('lists every build, most picked first, with its best showing', () => {
    const samples = talentSamples([
      kill(nythendra, 1, [member('Alpha', fire, '0000000', 400), member('Beta', fire, '0000000', 100), member('Gamma', fire, '1111111', 300)]),
      kill(ursoc, 2, [member('Beta', fire, '0000000', 90), member('Gamma', fire, '1111111', 100)])
    ]);
    const summary = talentBuilds(samples);

    expect(summary.picks).toBe(5);
    expect(summary.builds.map(build => [build.talents, build.count, build.characters, build.best.character.name, build.best.boss.slug])).toEqual([
      ['0000000', 3, 2, 'Alpha', 'nythendra'],
      ['1111111', 2, 1, 'Gamma', 'ursoc']
    ]);
    expect(summary.builds[0].share).toBeCloseTo(.6);
    // Top players: Alpha on Nythendra and Gamma on Ursoc.
    expect(summary.builds.map(build => build.topShare)).toEqual([.5, .5]);
  });

  it('names the talents of a build', () => {
    expect(buildTalents('01.2', specTiers(table, fire)).map(entry => entry?.id)).toEqual([0, 11, undefined, 32, undefined, undefined, undefined]);
  });
});

describe('bossTalentShares and notablePicks', () => {
  const samples = (raidBoss: RaidBoss, talents: string[]) => talents.map((entry, index) =>
    ({ boss: raidBoss, talents: entry, key: `${raidBoss.slug}${index}` } as TalentSample));

  it('shares each boss\'s picks beside the other bosses\'', () => {
    const shares = bossTalentShares([
      ...samples(nythendra, ['0000000', '1000000']),
      ...samples(ursoc, ['1000000', '1000000', '2000000', '2000000'])
    ], [nythendra, ursoc], specTiers(table, fire));

    expect(shares.map(entry => [entry.boss.slug, entry.picks, entry.elsewherePicks])).toEqual([['nythendra', 2, 4], ['ursoc', 4, 2]]);
    expect(shares[0].shares[0]).toEqual([.5, .5, 0]);
    expect(shares[0].elsewhere[0]).toEqual([0, .5, .5]);
    expect(shares[1].elsewhere[0]).toEqual([.5, .5, 0]);
  });

  it('marks the talents picked ten points more on a boss, given enough picks', () => {
    const many = (raidBoss: RaidBoss, first: number, total: number) =>
      samples(raidBoss, Array.from({ length: total }, (_, index) => index < first ? '0000000' : '1000000'));
    const [onNythendra] = bossTalentShares([...many(nythendra, 8, 10), ...many(ursoc, 5, 10)], [nythendra, ursoc], specTiers(table, fire));
    expect(notablePicks(onNythendra)).toEqual([{ tier: 0, column: 0, share: .8, elsewhere: .5, difference: expect.closeTo(.3) }]);

    const [few] = bossTalentShares([...many(nythendra, 8, 9), ...many(ursoc, 5, 10)], [nythendra, ursoc], specTiers(table, fire));
    expect(notablePicks(few)).toEqual([]);
  });
});

describe('talentSwaps', () => {
  const sample = (key: string, raidBoss: RaidBoss, talents: string) => ({ key, boss: raidBoss, talents } as TalentSample);
  const xavius = boss(2, 'xavius');
  const samples = [
    sample('a', nythendra, '00'), sample('a', ursoc, '01'), sample('a', xavius, '00'),
    sample('b', nythendra, '11'), sample('b', ursoc, '11'),
    sample('c', nythendra, '22')
  ];

  it('counts the characters who changed a tier between bosses', () => {
    expect(talentSwaps(samples, 2)).toEqual({ characters: 2, changed: 1, tiers: [0, 1] });
  });

  it('for one boss, counts those whose pick there isn\'t their usual one', () => {
    expect(talentSwaps(samples, 2, ursoc)).toEqual({ characters: 2, changed: 1, tiers: [0, 1] });
    expect(talentSwaps(samples, 2, xavius)).toEqual({ characters: 1, changed: 0, tiers: [0, 0] });
  });
});

describe('specTalentSummaries', () => {
  it('summarises each spec in the order given, a spec nobody played included', () => {
    const samples = talentSamples([kill(nythendra, 1, [member('Alpha', fire, '0000000', 400), member('Beta', fire, '0000001', 100)])]);
    const [fireSummary, holySummary] = specTalentSummaries(samples, [fire, holy], table);

    expect(fireSummary.picks.characters).toBe(2);
    expect(fireSummary.buildCount).toBe(2);
    expect(fireSummary.agreement).toBeCloseTo((6 + .5) / 7);
    expect(holySummary.picks.picks).toBe(0);
    expect(holySummary.topBuild).toBeUndefined();
  });
});

describe('specsMatching', () => {
  const retribution: RaidSpec = { id: 70, classId: 2, name: 'Retribution', role: 'dps' };
  const specs = [fire, holy, retribution];
  const names = (classId: number | undefined, role: RoleFilter) => specsMatching(specs, classId, role).map(spec => spec.name);

  it('keeps every spec without a class or a role', () => {
    expect(names(undefined, 'all')).toEqual(['Fire', 'Holy', 'Retribution']);
  });

  it('narrows by class, by role, and by both', () => {
    expect(names(2, 'all')).toEqual(['Holy', 'Retribution']);
    expect(names(undefined, 'dps')).toEqual(['Fire', 'Retribution']);
    expect(names(2, 'healer')).toEqual(['Holy']);
    expect(names(8, 'healer')).toEqual([]);
  });
});

describe('sortByPerformance', () => {
  const retribution: RaidSpec = { id: 70, classId: 2, name: 'Retribution', role: 'dps' };
  const arcane: RaidSpec = { id: 62, classId: 8, name: 'Arcane', role: 'dps' };
  const frost: RaidSpec = { id: 64, classId: 8, name: 'Frost', role: 'dps' };
  const scored = (...values: number[]) => values.map((score, index) => ({ character: character(`Scored${score}x${index}`), score }));
  const names = (items: Array<{ spec: RaidSpec }>) => items.map(item => item.spec.name);

  it('orders by the average of each spec\'s top ten scores, not its single best', () => {
    const scores = new Map([
      [fire, scored(6969, ...Array<number>(10).fill(1000))],
      [retribution, scored(5000)]
    ]);
    expect(names(sortByPerformance([{ spec: fire }, { spec: retribution }], scores))).toEqual(['Retribution', 'Fire']);
  });

  it('puts unscored specs last and keeps the given order on a tie', () => {
    const scores = new Map([[arcane, scored(3000)], [fire, scored(3000)]]);
    expect(names(sortByPerformance([{ spec: frost }, { spec: arcane }, { spec: fire }], scores))).toEqual(['Arcane', 'Fire', 'Frost']);
  });
});

describe('formatting', () => {
  it('formats shares and differences', () => {
    expect([0, .004, .005, .571, 1].map(formatShare)).toEqual(['0%', '<1%', '1%', '57%', '100%']);
    expect([.234, -.08, .001].map(formatPoints)).toEqual(['+23', '−8', '0']);
  });
});
