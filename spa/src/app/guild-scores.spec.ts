import { describe, it, expect } from 'vitest';
import { GuildMember, easierDifficulty, guildMythicPlusScores, guildRaidScores } from './guild-scores';
import { MythicPlusIndex } from './mythic-plus';
import { RaidSpec, RankedScore } from './raid-logs';

const member = (name: string, classId = 8): GuildMember => ({ name, class: classId });

describe('guildRaidScores', () => {
  const fire: RaidSpec = { id: 63, classId: 8, name: 'Fire', role: 'dps' };
  const holy: RaidSpec = { id: 65, classId: 2, name: 'Holy', role: 'healer' };

  // Only what the guild table reads; the leaderboard's own rows carry much more.
  const ranked = (name: string, score: number, rank: number, killed = 7, realm = 'Evermoon', spec = fire): RankedScore =>
    ({
      character: { name, realm, classId: spec.classId, race: 10, gender: 0, guild: '' },
      spec, score, rank, killed, bosses: Array.from({ length: 7 }), faction: 1, itemLevel: 870, performance: score / 6969
    } as RankedScore);

  const rankings = {
    dps: [ranked('Top', 6969, 1), ranked('Mage', 3500, 2, 6), ranked('Hybrid', 1200, 3, 2), ranked('Twin', 1000, 4), ranked('Other', 900, 5, 7, 'Tauri')],
    hps: [ranked('Healer', 6969, 1, 7, 'Evermoon', holy), ranked('Hybrid', 3000, 2, 5, 'Evermoon', holy), ranked('Tied', 1000, 3, 5, 'Evermoon', holy)]
  };

  it('gives each member the higher of their DPS and HPS score, ranked within the guild', () => {
    const scores = guildRaidScores(
      [member('Mage'), member('Hybrid', 2), member('Healer', 2), member('Nobody')], 'Evermoon', rankings);

    expect(scores.rows.map(row => [row.place, row.member.name, row.metric, row.score, row.leaderboardRank, row.killed])).toEqual([
      [1, 'Healer', 'hps', 6969, 1, 7],
      [2, 'Mage', 'dps', 3500, 2, 6],
      [3, 'Hybrid', 'hps', 3000, 2, 5]
    ]);
    expect(scores.rows[2].spec?.name).toBe('Holy');
    expect(scores.rows[2].bossCount).toBe(7);
    expect(scores.unscored.map(entry => entry.name)).toEqual(['Nobody']);
  });

  it("colours each score against its own leaderboard's top score", () => {
    const scores = guildRaidScores([member('Healer', 2), member('Mage'), member('Twin')], 'Evermoon', rankings);

    expect(scores.rows.map(row => row.quality)).toEqual(['artifact', 'uncommon', 'uncommon']);
  });

  it('finds members on their own realm only', () => {
    expect(guildRaidScores([member('Other')], 'Evermoon', rankings).rows).toEqual([]);
    expect(guildRaidScores([member('Other')], 'Tauri', rankings).rows.map(row => row.leaderboardRank)).toEqual([5]);
  });

  it('shares a place on an equal score, more bosses killed listed first', () => {
    const scores = guildRaidScores([member('Twin'), member('Tied', 2), member('Mage')], 'Evermoon', rankings);

    expect(scores.rows.map(row => [row.place, row.member.name])).toEqual([[1, 'Mage'], [2, 'Twin'], [2, 'Tied']]);
  });
});

describe('easierDifficulty', () => {
  // The index lists them easiest first; LFR is never logged.
  const [lfr, normal, heroic, mythic] = [0, 3618, 2986, 293].map(kills => ({ kills }));
  const difficulties = [lfr, normal, heroic, mythic];

  it('steps down to the next difficulty with kills, never to an unlogged one', () => {
    expect(easierDifficulty(difficulties, mythic)).toBe(heroic);
    expect(easierDifficulty(difficulties, heroic)).toBe(normal);
    expect(easierDifficulty(difficulties, normal)).toBeUndefined();
  });
});

describe('guildMythicPlusScores', () => {
  const index: Pick<MythicPlusIndex, 'players' | 'standings'> = {
    players: [
      ['Alpha', 'Evermoon', 'Endless', 8, 10, 0],
      ['Beta', 'Evermoon', 'Endless', 2, 10, 0],
      ['Beta', 'Tauri', 'Outlaws', 2, 1, 0],
      ['Gamma', 'Evermoon', '', 5, 10, 0],
      ['Delta', 'Evermoon', 'Endless', 4, 10, 0]
    ],
    standings: [[1000.5, 2], [1200, 1], [1300, 1], [1000.5, 2], [900, 5]]
  };

  it("reads each member's season score and rank from the standings, best first", () => {
    const scores = guildMythicPlusScores(
      [member('Delta', 4), member('Alpha'), member('Beta', 2), member('Gamma', 5), member('Omega')], 'Evermoon', index)!;

    expect(scores.rows.map(row => [row.place, row.member.name, row.score, row.leaderboardRank])).toEqual([
      [1, 'Beta', 1200, 1],
      [2, 'Alpha', 1000.5, 2],
      [2, 'Gamma', 1000.5, 2],
      [4, 'Delta', 900, 5]
    ]);
    expect(scores.unscored.map(entry => entry.name)).toEqual(['Omega']);
  });

  it("colours against the season's top score, any realm", () => {
    const scores = guildMythicPlusScores([member('Beta', 2)], 'Tauri', index)!;

    expect(scores.rows.map(row => [row.score, row.quality])).toEqual([[1300, 'artifact']]);
    expect(guildMythicPlusScores([member('Beta', 2)], 'Evermoon', index)!.rows[0].quality).toBe('legendary');
  });

  it('gives up on an export without standings', () => {
    expect(guildMythicPlusScores([member('Alpha')], 'Evermoon', { players: index.players })).toBeUndefined();
    expect(guildMythicPlusScores([member('Alpha')], 'Evermoon', { players: index.players, standings: [] })).toBeUndefined();
  });
});
