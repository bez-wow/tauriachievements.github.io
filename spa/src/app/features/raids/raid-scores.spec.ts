import { describe, expect, it } from 'vitest';
import {
  MAX_SCORE,
  bossStanding,
  formatScoreTick,
  killsBefore,
  performanceQuality,
  rankCharacters,
  rankScores,
  scoreChanges,
  scoreCharacters,
  scoreTicks,
  scoresBySpec,
  scoresBySpecForKills,
  specMetric,
  specPerformance,
  topAverage
} from './raid-scores';
import { RaidBoss, RaidCharacter, RaidKillDetails, RaidSpec } from './raid-logs.types';
import { characterKey, logKey } from './raid-logs';
import { index, mythic, kills } from './raid-logs.fixture';

describe('rankCharacters', () => {
  it("ranks each character's best kill, healers only by healing", () => {
    const dps = rankCharacters(kills, 'dps');
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

describe('bossStanding', () => {
  const light = characterKey({ name: 'Light', realm: 'Evermoon' });
  const sosa = characterKey({ name: 'Sósa', realm: 'Evermoon' });

  it('ranks the character among everyone, against the best anyone did', () => {
    expect(bossStanding(kills, 'dps', light)).toEqual({ rank: 3, ranked: 3, relative: 1 / 3 });
    expect(bossStanding(kills, 'dps', sosa)).toEqual({ rank: 2, ranked: 3, relative: 500_000 / 600_000 });
  });

  it('ranks the character among their class only, against the best of the class', () => {
    expect(bossStanding(kills, 'dps', light, { classId: 2 })).toEqual({ rank: 1, ranked: 1, relative: 1 });
    expect(bossStanding(kills, 'dps', sosa, { classId: 8 })).toEqual({ rank: 2, ranked: 2, relative: 500_000 / 600_000 });
  });

  it('has no rank or share for a character the ranking leaves out, but counts the others', () => {
    expect(bossStanding(kills, 'hps', sosa)).toEqual({ rank: undefined, ranked: 1, relative: 0 });
    expect(bossStanding(kills, 'hps', sosa, { classId: 8 })).toEqual({ rank: undefined, ranked: 0, relative: 0 });
    expect(bossStanding([], 'dps', sosa)).toEqual({ rank: undefined, ranked: 0, relative: 0 });
  });
});

describe('scoreCharacters', () => {
  const bosses = ['one', 'two', 'three', 'four'].map((slug, bossIndex): RaidBoss =>
    ({ id: bossIndex, slug, name: slug, shortName: slug, index: bossIndex, portrait: '' }));
  const fire = index.specs.get(63)!;
  const frost = index.specs.get(64)!;
  const holy = index.specs.get(65)!;
  const protection = index.specs.get(66)!;

  const character = (name: string, race = 10, classId = 8): RaidCharacter =>
    ({ name, realm: 'Tauri', classId, race, gender: 0, guild: '' });

  function kill(boss: number, killedAt: number, members: Array<[RaidCharacter, RaidSpec, number, number?]>): RaidKillDetails {
    return {
      realm: 'Tauri', logId: boss * 100 + killedAt, boss: bosses[boss], difficulty: mythic, killedAt, fightMs: 1_000,
      faction: 1, wipes: 0, deaths: 0, resurrects: 0, items: [],
      members: members.map(([who, spec, dps, hps = 0]) => ({
        character: who, spec, itemLevel: 860 + killedAt, damage: dps, healing: hps, absorbs: 0, overhealing: 0,
        damageTaken: 0, interrupts: 0, dispels: 0, dps, hps, talents: '', trinkets: []
      }))
    };
  }

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

  it("gives the score's share of each boss as bossStanding among everyone", () => {
    const example = scoreCharacters(bosses, bossKills, 'dps')[1];
    const key = characterKey(example.character);
    expect(bossKills.map(kills => bossStanding(kills, 'dps', key).relative)).toEqual(example.bosses.map(entry => entry.relative));
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
    const fireOnly = scoreCharacters(bosses, bossKills, 'dps', fire.id);
    expect(fireOnly.map(entry => [entry.character.name, entry.score, entry.killed])).toEqual([
      ['Best', MAX_SCORE, 4],
      ['Example', Math.floor(MAX_SCORE * .1 / 4), 1]
    ]);
    expect(fireOnly[1].spec?.name).toBe('Fire');
  });

  it("leaves out a former character with the name, whose kill still sets the boss's best", () => {
    const former: RaidCharacter = { ...character('Example', 10, 2), former: true };
    const withFormer = bossKills.map((kills, boss) => boss === 0 ? [...kills, kill(0, 5, [[former, protection, 400]])] : kills);

    expect(scoreCharacters(bosses, withFormer, 'dps').map(entry => [entry.character.name, entry.character.classId, entry.score]))
      .toEqual([['Best', 8, 5662], ['Example', 8, 1960], ['Tank', 2, 871]]);
    expect(rankCharacters(withFormer[0], 'dps').map(entry => entry.member.character.name)).toEqual(['Best', 'Example']);
    expect(bossStanding(withFormer[0], 'dps', characterKey(former))).toEqual({ rank: 2, ranked: 2, relative: 10 / 400 });
    expect(scoresBySpec(bosses, withFormer).get(protection)?.map(entry => entry.character.name)).toEqual(['Tank']);
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

    it("sorts one difficulty's kills by boss before scoring them", () => {
      expect(scoresBySpecForKills(bosses, bossKills.flat().reverse())).toEqual(scoresBySpec(bosses, bossKills));
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
      expect([mage.count, mage.score]).toEqual([2, Math.round((MAX_SCORE + 1916) / 2)]);
      expect(damage.characterCount).toBe(2);
      expect(damage.classes.every(group => group.specs.every(spec => spec.role === 'dps'))).toBe(true);

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
      const newKill = kill(1, 5, [[character('B'), fire, 200]]);
      const kills = [
        [kill(0, 1, [[character('A'), fire, 100], [character('B'), fire, 90]])],
        [kill(1, 2, [[character('A'), fire, 100], [character('B'), fire, 50]]), newKill]
      ];
      expect([...changesWithout(kills, newKill, 2)]).toEqual([
        ['tauri/B', { rank: 1, score: 6620 - 4878, isNew: false }],
        ['tauri/A', { rank: -1, score: 5226 - MAX_SCORE, isNew: false }]
      ]);
    });

    it("marks a character new to the ranking and leaves out one who didn't move", () => {
      const changes = changesWithout(bossKills, bossKills[3][0]);
      expect(changes.has('tauri/Best')).toBe(false);
      expect(changes.get('tauri/Example')).toEqual({ rank: 0, score: 2090 - 2787, isNew: false });
      expect(changes.get('tauri/Tank')).toEqual({ rank: 0, score: 0, isNew: true });
    });
  });
});

describe('performanceQuality', () => {
  it('knows the parse colours', () => {
    expect([1, .97, .8, .6, .3, .1].map(performanceQuality)).toEqual([6, 5, 4, 3, 2, 0]);
  });
});
