import { describe, expect, it } from 'vitest';
import {
  MAX_SCORE,
  RaidBoss,
  RaidBossFile,
  RaidCharacter,
  RaidKillDetails,
  RaidLogsIndexFile,
  RaidSpec,
  decodeBossFile,
  decodeGenders,
  decodeIndex,
  bossesInKillOrder,
  defaultDifficulty,
  fastestKills,
  formatAgo,
  formatAmount,
  formatFightTime,
  formatPerSecond,
  formatScoreTick,
  guildProgression,
  killsBefore,
  logKey,
  nameMatches,
  performanceQuality,
  raceFaction,
  rankCharacters,
  rankScores,
  raidLogLink,
  scoreChanges,
  scoreCharacters,
  scoreTicks,
  scoresBySpec,
  specMetric,
  specPerformance,
  speedRank,
  topAverage
} from './raid-logs';

// Two bosses, Heroic and Mythic, in the exporter's format (RaidLogFileWriter.cs).
const indexFile: RaidLogsIndexFile = {
  version: 1,
  generatedAt: '2026-10-12T16:00:00Z',
  raid: { id: 1520, slug: 'emerald-nightmare', name: 'The Emerald Nightmare' },
  difficulties: [
    { id: 17, slug: 'lfr', name: 'Looking For Raid', shortName: 'LFR', kills: 0 },
    { id: 15, slug: 'heroic', name: 'Heroic', shortName: 'HC', kills: 3 },
    { id: 16, slug: 'mythic', name: 'Mythic', shortName: 'M', kills: 2 }
  ],
  bosses: [
    { id: 1853, slug: 'nythendra', name: 'Nythendra' },
    { id: 1873, slug: 'ilgynoth', name: "Il'gynoth, The Heart of Corruption" }
  ],
  specs: [
    { id: 63, class: 8, name: 'Fire', role: 'dps' },
    { id: 64, class: 8, name: 'Frost', role: 'dps' },
    { id: 65, class: 2, name: 'Holy', role: 'healer' },
    { id: 66, class: 2, name: 'Protection', role: 'tank' }
  ],
  guilds: [
    ['Miracle', 'Evermoon', 1, 3676],
    ['Outlaws', 'Tauri', 0, 602],
    ['', 'Evermoon', 1, 8489]
  ],
  // [realm, logId, boss, difficultyId, killedAtUnix, fightMs, guild, faction, wipes, deaths, members]
  logs: [
    ['Tauri', 10, 0, 16, 1_000, 300_000, 0, 1, 2, 3, 20],
    ['Tauri', 11, 0, 16, 2_000, 280_000, 1, 0, 0, 1, 20],
    ['Tauri', 12, 1, 15, 3_000, 400_000, 1, 0, 0, 0, 20],
    ['Tauri', 13, 0, 15, 4_000, 200_000, 2, 1, 0, 0, 20],
    ['WoD', 10, 0, 15, 5_000, 250_000, -1, 1, 0, 0, 14]
  ],
  previousGeneratedAt: '2026-10-11T16:00:00Z',
  newLogs: [['WoD', 10]],
  top: [{ boss: 'nythendra', difficulty: 'mythic', dps: ['Sósa', 'Evermoon', 8, 64, 700_303, 'Tauri', 10], hps: null }],
  items: [[139236, 'Grubby Silver Ring', 4, 'inv_70_raid_ring1b']]
};

const index = decodeIndex(indexFile);
const [nythendra] = index.bosses;
const mythic = index.difficulties[2];

const bossFile: RaidBossFile = {
  version: 1,
  boss: 'nythendra',
  difficulty: 'mythic',
  guilds: [['Miracle', 'Evermoon', 1, 3676], ['Outlaws', 'Tauri', 0, 602]],
  players: [
    ['Sósa', 'Evermoon', 8, 10, 0, 'Competence Optional'],
    ['Kael', 'Tauri', 8, 1, 0, ''],
    ['Light', 'Evermoon', 2, 10, 1, 'Miracle']
  ],
  // [player, spec, ilvl, damage, healing, absorbs, overhealing, taken, interrupts, dispels]
  logs: [
    ['Tauri', 10, 1_000, 300_000, 0, 1, 2, 3, 1, [
      [0, 64, 870, 150_000_000, 0, 0, 0, 1, 0, 0],
      [1, 63, 871, 120_000_000, 0, 0, 0, 1, 0, 0],
      [2, 65, 872, 3_000_000, 90_000_000, 30_000_000, 5, 1, 0, 4]
    ], [139236]],
    ['Tauri', 11, 2_000, 280_000, 1, 0, 0, 1, 0, [
      [0, 63, 875, 140_000_000, 0, 0, 0, 1, 0, 0],
      [1, 63, 876, 168_000_000, 0, 0, 0, 1, 0, 0],
      [2, 66, 877, 56_000_000, 1_000_000, 0, 0, 1, 0, 0]
    ], []]
  ]
};

const kills = decodeBossFile(bossFile, nythendra, mythic, index.specs);

describe('decodeIndex', () => {
  it('reads kills, guilds, the top performers and the loot', () => {
    expect(index.generatedAt?.toISOString()).toBe('2026-10-12T16:00:00.000Z');
    expect(index.bosses.map(boss => boss.shortName)).toEqual(['Nythendra', "Il'gynoth"]);
    expect(index.kills).toHaveLength(5);
    expect(index.kills[0]).toMatchObject({ realm: 'Tauri', logId: 10, killedAt: 1_000_000, fightMs: 300_000, wipes: 2, deaths: 3 });
    expect(index.kills[0].guild?.name).toBe('Miracle');
    expect(index.kills[4].guild).toBeUndefined();
    expect(index.top.get('nythendra|mythic')?.dps).toMatchObject({ name: 'Sósa', perSecond: 700_303, logId: 10 });
    expect(index.top.get('nythendra|mythic')?.dps?.spec?.name).toBe('Frost');
    expect(index.items.get(139236)?.name).toBe('Grubby Silver Ring');
  });

  it('reads the kills added since the previous export, by logKey', () => {
    expect(index.previousGeneratedAt?.toISOString()).toBe('2026-10-11T16:00:00.000Z');
    expect([...index.newLogs]).toEqual(['wod/10']);

    const first = decodeIndex({ ...indexFile, previousGeneratedAt: undefined, newLogs: undefined });
    expect(first.previousGeneratedAt).toBeUndefined();
    expect(first.newLogs.size).toBe(0);
  });

  it('gives specs the Legion spec icons', () => {
    expect(index.specs.get(64)?.icon).toContain('legion-static.tauri.hu');
  });
});

describe('decodeBossFile', () => {
  it('works out damage and healing (with absorbs) per second', () => {
    const [first] = kills;
    expect(first.members).toHaveLength(3);
    expect(first.members[0].dps).toBe(500_000);
    expect(first.members[2].hps).toBe(400_000);
    expect(first.items).toEqual([139236]);
    expect(first.guild?.name).toBe('Miracle');
  });

  it('shares one character object between the kills', () => {
    expect(kills[0].members[0].character).toBe(kills[1].members[0].character);
  });
});

describe('decodeGenders', () => {
  it('keys the corrected genders like characterKey', () => {
    const genders = decodeGenders({ v: 1, female: { Evermoon: ['Sósa'], WoD: ['Ama'] }, male: { Tauri: ['Kael'] } });
    expect([...genders.entries()]).toEqual([['tauri/Kael', 0], ['evermoon/Sósa', 1], ['wod/Ama', 1]]);
  });
});

describe('rankCharacters', () => {
  it("ranks each character's best kill, healers only by healing", () => {
    const dps = rankCharacters(kills, 'dps');
    // Kael: 168M over 280 s = 600k beats Sósa's 500k; the paladin tank counts as damage, the healer doesn't.
    expect(dps.map(entry => [entry.rank, entry.member.character.name, Math.round(entry.value)])).toEqual([
      [1, 'Kael', 600_000],
      [2, 'Sósa', 500_000],
      [3, 'Light', 200_000]
    ]);
    expect(rankCharacters(kills, 'hps').map(entry => entry.member.character.name)).toEqual(['Light']);
  });

  it('ranks a spec on kills played as that spec only', () => {
    const fire = rankCharacters(kills, 'dps', { specId: 63 });
    expect(fire.map(entry => [entry.member.character.name, entry.kill.logId])).toEqual([['Kael', 11], ['Sósa', 11]]);
  });

  it('filters by realm and class', () => {
    expect(rankCharacters(kills, 'dps', { realm: 'tauri' }).map(entry => entry.member.character.name)).toEqual(['Kael']);
    expect(rankCharacters(kills, 'dps', { classId: 2 }).map(entry => entry.member.character.name)).toEqual(['Light']);
  });
});

describe('scoreCharacters', () => {
  const bosses = ['one', 'two', 'three', 'four'].map((slug, bossIndex): RaidBoss =>
    ({ id: bossIndex, slug, name: slug, shortName: slug, index: bossIndex, portrait: '' }));
  const fire = index.specs.get(63)!;
  const frost = index.specs.get(64)!;
  const holy = index.specs.get(65)!;
  const protection = index.specs.get(66)!;

  // A new character object each time, as each boss file has its own.
  const character = (name: string, race = 10, classId = 8): RaidCharacter =>
    ({ name, realm: 'Tauri', classId, race, gender: 0, guild: '' });

  // One-second fights, so damage is the DPS and healing the HPS.
  function kill(boss: number, killedAt: number, members: Array<[RaidCharacter, RaidSpec, number, number?]>): RaidKillDetails {
    return {
      realm: 'Tauri', logId: boss * 100 + killedAt, boss: bosses[boss], difficulty: mythic, killedAt, fightMs: 1_000,
      faction: 1, wipes: 0, deaths: 0, resurrects: 0, items: [],
      members: members.map(([who, spec, dps, hps = 0]) => ({
        character: who, spec, itemLevel: 860 + killedAt, damage: dps, healing: hps, absorbs: 0, overhealing: 0,
        damageTaken: 0, interrupts: 0, dispels: 0, dps, hps
      }))
    };
  }

  // The worked example: 10/100, 160/200, 300/1000 and no kill of the fourth boss make 30%.
  const bossKills = [
    [kill(0, 1, [[character('Best'), fire, 100], [character('Example'), fire, 10], [character('Light', 10, 2), holy, 0, 50]])],
    [kill(1, 2, [[character('Best'), fire, 200], [character('Example'), frost, 160]])],
    [kill(2, 3, [[character('Best'), fire, 1000], [character('Example'), frost, 300]])],
    [kill(3, 4, [[character('Best'), fire, 1000], [character('Tank', 1, 2), protection, 500]])]
  ];

  it('averages each boss against its best, out of 6969', () => {
    const scores = scoreCharacters(bosses, bossKills, 'dps');
    expect(scores.map(entry => [entry.character.name, entry.score, entry.killed])).toEqual([
      ['Best', MAX_SCORE, 4],
      ['Example', 2090, 3],
      ['Tank', 871, 1]
    ]);

    const example = scores[1];
    expect(example.performance).toBeCloseTo(.3);
    expect(example.bosses.map(entry => entry.relative)).toEqual([.1, .8, .3, 0]);
    expect(example.bosses[3].best).toBeUndefined();
  });

  it('scores healers only by healing', () => {
    const healing = scoreCharacters(bosses, bossKills, 'hps');
    expect(healing.map(entry => [entry.character.name, entry.score])).toEqual([['Light', MAX_SCORE]]);
  });

  it('leaves a boss nobody has killed out of the average', () => {
    const scores = scoreCharacters(bosses, [...bossKills.slice(0, 3), []], 'dps');
    expect(scores.find(entry => entry.character.name === 'Example')?.score).toBe(Math.floor(MAX_SCORE * 1.2 / 3));
    expect(scoreCharacters(bosses, [[], [], [], []], 'dps')).toEqual([]);
  });

  it('shows the spec played most, the latest item level and the faction of the race', () => {
    const scores = scoreCharacters(bosses, bossKills, 'dps');
    const example = scores.find(entry => entry.character.name === 'Example')!;
    expect(example.spec?.name).toBe('Frost');
    expect(example.itemLevel).toBe(863);
    // A Blood Elf is Horde; the human tank is Alliance though the kill was Horde.
    expect(example.faction).toBe(1);
    expect(scores.find(entry => entry.character.name === 'Tank')?.faction).toBe(0);
  });

  it('ranks the filtered rows from 1, keeping the scores', () => {
    const scores = scoreCharacters(bosses, bossKills, 'dps');
    expect(rankScores(scores, { classId: 2 }).map(entry => [entry.rank, entry.character.name, entry.score])).toEqual([[1, 'Tank', 871]]);
    expect(rankScores(scores, { classId: 8 }).map(entry => entry.rank)).toEqual([1, 2]);
    expect(rankScores(scores, { realm: 'wod' })).toEqual([]);
  });

  it('scores a spec on the kills played as it, against the best of any spec', () => {
    // Example played Fire only on the first boss: 10 of the best 100 there, nothing elsewhere.
    const fireOnly = scoreCharacters(bosses, bossKills, 'dps', fire.id);
    expect(fireOnly.map(entry => [entry.character.name, entry.score, entry.killed])).toEqual([
      ['Best', MAX_SCORE, 4],
      ['Example', Math.floor(MAX_SCORE * .1 / 4), 1]
    ]);
    expect(fireOnly[1].spec?.name).toBe('Fire');
  });

  describe('by spec', () => {
    it('gives each character the score the leaderboard shows with their spec picked', () => {
      const bySpec = scoresBySpec(bosses, bossKills);
      expect([...bySpec].map(([spec, scores]) => [spec.name, scores.map(entry => [entry.character.name, entry.score])])).toEqual([
        ['Fire', [['Best', MAX_SCORE], ['Example', 174]]],
        ['Holy', [['Light', MAX_SCORE]]],
        ['Frost', [['Example', 1916]]],
        ['Protection', [['Tank', 871]]]
      ]);

      for (const [spec, scores] of bySpec) {
        const leaderboard = scoreCharacters(bosses, bossKills, specMetric(spec), spec.id);
        expect(new Map(scores.map(entry => [entry.character.name, entry.score])))
          .toEqual(new Map(leaderboard.map(entry => [entry.character.name, entry.score])));
      }
    });

    it("averages each spec's best scores and orders classes by their best spec", () => {
      const scores = scoresBySpec(bosses, bossKills);
      const damage = specPerformance(scores, 'dps');
      const mage = damage.classes[0];
      expect(mage.className).toBe('Mage');
      expect(mage.specs.map(spec => [spec.spec, spec.score, spec.count, spec.best?.character.name])).toEqual([
        ['Fire', Math.round((MAX_SCORE + 174) / 2), 2, 'Best'],
        ['Frost', 1916, 1, 'Example'],
        ['Arcane', 0, 0, undefined]
      ]);
      // Example counts once, at their better spec.
      expect([mage.count, mage.score]).toEqual([2, Math.round((MAX_SCORE + 1916) / 2)]);
      expect(damage.characterCount).toBe(2);
      expect(damage.classes.every(group => group.specs.every(spec => spec.role === 'dps'))).toBe(true);

      // With every role, Paladin leads: Light's Holy, alone at the top, beats Fire's average.
      const everyone = specPerformance(scores);
      expect(everyone.classes.slice(0, 2).map(group => [group.className, group.score])).toEqual([
        ['Paladin', Math.round((MAX_SCORE + 871) / 2)],
        ['Mage', Math.round((MAX_SCORE + 1916) / 2)]
      ]);
      expect(everyone.characterCount).toBe(4);
    });

    it('averages the best scores only, or all of them when there are fewer', () => {
      expect(topAverage([1, 5, 3], 2)).toBe(4);
      expect(topAverage([5, 2])).toBe(4);
      expect(topAverage([])).toBe(0);
    });

    it('draws clean score gridlines', () => {
      expect(scoreTicks(5368)).toEqual([0, 2000, 4000, 6000]);
      expect(scoreTicks(2400)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
      expect(scoreTicks(0)).toEqual([0, 100]);
      expect([0, 500, 1000, 2500].map(formatScoreTick)).toEqual(['0', '500', '1k', '2.5k']);
    });
  });

  describe('since the previous scan', () => {
    const changesWithout = (kills: RaidKillDetails[][], newKill: RaidKillDetails, bossCount = 4) => {
      const scored = bosses.slice(0, bossCount);
      const before = killsBefore(kills, new Set([logKey(newKill)]));
      return scoreChanges(rankScores(scoreCharacters(scored, kills, 'dps')), rankScores(scoreCharacters(scored, before, 'dps')));
    };

    it('leaves out only the kills the previous scan did not have', () => {
      expect(killsBefore(bossKills, new Set([logKey(bossKills[3][0])])).map(kills => kills.length)).toEqual([1, 1, 1, 0]);
    });

    it('measures the ranks climbed and the score gained', () => {
      // B's new kill beats A's best on the second boss: B climbs to first, and A's share of that boss halves.
      const newKill = kill(1, 5, [[character('B'), fire, 200]]);
      const kills = [
        [kill(0, 1, [[character('A'), fire, 100], [character('B'), fire, 90]])],
        [kill(1, 2, [[character('A'), fire, 100], [character('B'), fire, 50]]), newKill]
      ];
      // Before: A 6969, B (90% + 50%) / 2 = 4878. Now: A (100% + 50%) / 2 = 5226, B (90% + 100%) / 2 = 6620.
      expect([...changesWithout(kills, newKill, 2)]).toEqual([
        ['tauri/B', { rank: 1, score: 6620 - 4878, isNew: false }],
        ['tauri/A', { rank: -1, score: 5226 - MAX_SCORE, isNew: false }]
      ]);
    });

    it("marks a character new to the ranking and leaves out one who didn't move", () => {
      // Before the fourth boss's first kill: Best 3/3, Example (10% + 80% + 30%) / 3 = 2787, no Tank.
      const changes = changesWithout(bossKills, bossKills[3][0]);
      expect(changes.has('tauri/Best')).toBe(false);
      expect(changes.get('tauri/Example')).toEqual({ rank: 0, score: 2090 - 2787, isNew: false });
      expect(changes.get('tauri/Tank')).toEqual({ rank: 0, score: 0, isNew: true });
    });
  });
});

describe('raceFaction and performanceQuality', () => {
  it('knows the sides and the parse colours', () => {
    expect([raceFaction(1), raceFaction(10), raceFaction(25), raceFaction(26), raceFaction(24)]).toEqual([0, 1, 0, 1, undefined]);
    expect([1, .97, .8, .6, .3, .1].map(performanceQuality)).toEqual([6, 5, 4, 3, 2, 0]);
  });
});

describe('guildProgression', () => {
  it('ranks the most bosses down first, then who got there first', () => {
    const heroic = guildProgression(index.kills, 15, index.bosses.length);
    // Outlaws killed Il'gynoth; the unnamed guild and the pickup group don't take part.
    expect(heroic.map(row => [row.rank, row.guild.name, row.killed])).toEqual([[1, 'Outlaws', 1]]);

    const mythicRows = guildProgression(index.kills, 16, index.bosses.length);
    expect(mythicRows.map(row => [row.guild.name, row.killed, row.progressedAt])).toEqual([
      ['Miracle', 1, 1_000_000],
      ['Outlaws', 1, 2_000_000]
    ]);
    expect(mythicRows[0].firsts[0]?.logId).toBe(10);
    expect(mythicRows[0].firsts[1]).toBeUndefined();
  });
});

describe('fastestKills and speedRank', () => {
  it('orders by fight time, the earlier kill first on a tie', () => {
    const heroic = index.kills.filter(kill => kill.difficulty.id === 15 && kill.boss === nythendra);
    expect(fastestKills(heroic).map(kill => kill.logId)).toEqual([13, 10]);
    expect(speedRank({ realm: 'WoD', logId: 10 }, heroic)).toBe(2);
  });
});

describe('bossesInKillOrder', () => {
  it('puts the bosses in the order raiders kill them', () => {
    const slugs = ['nythendra', 'ilgynoth', 'elerethe-renferal', 'ursoc', 'dragons-of-nightmare', 'cenarius', 'xavius', 'new-boss'];
    const bosses = slugs.map((slug, bossIndex) => ({ slug, index: bossIndex }));
    expect(bossesInKillOrder(bosses).map(boss => boss.slug)).toEqual(
      ['nythendra', 'ursoc', 'dragons-of-nightmare', 'elerethe-renferal', 'ilgynoth', 'cenarius', 'xavius', 'new-boss']);
  });
});

describe('defaultDifficulty', () => {
  it('opens on the hardest difficulty with a kill', () => {
    expect(defaultDifficulty(index.difficulties)?.slug).toBe('mythic');
    expect(defaultDifficulty(index.difficulties.map(difficulty => ({ ...difficulty, kills: difficulty.id === 15 ? 1 : 0 })))?.slug).toBe('heroic');
  });
});

describe('formatting', () => {
  it('formats fight times, per-second figures and totals', () => {
    expect(formatFightTime(296_400)).toBe('4:56');
    expect(formatFightTime(3_725_000)).toBe('1:02:05');
    expect(formatPerSecond(754_644)).toBe('754.6k');
    expect(formatPerSecond(1_236_000)).toBe('1.24M');
    expect(formatPerSecond(999)).toBe('999');
    expect(formatAmount(63_030_057)).toBe('63.0M');
    expect(formatAmount(2_740_000_000)).toBe('2.74B');
  });

  it('says how long ago', () => {
    const now = Date.UTC(2026, 9, 12, 12);
    expect(formatAgo(now - 30_000, now)).toBe('just now');
    expect(formatAgo(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(formatAgo(now - 5 * 3_600_000, now)).toBe('5 h ago');
    expect(formatAgo(now - 3 * 86_400_000, now)).toBe('3 d ago');
  });

  it('finds names without regard to case or accents', () => {
    expect(nameMatches('Sósa', 'sosa')).toBe(true);
    expect(nameMatches('Ørna', 'rna')).toBe(true);
    expect(nameMatches('Kael', 'x')).toBe(false);
    expect(nameMatches('Kael', '  ')).toBe(true);
  });

  it('links a log by its realm and id', () => {
    expect(raidLogLink({ realm: 'WoD', logId: 283007 })).toEqual(['/raid-logs', 'log', 'wod', 283007]);
  });
});
