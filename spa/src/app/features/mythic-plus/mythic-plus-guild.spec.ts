import { describe, expect, it } from 'vitest';
import { MythicPlusMember, MythicPlusRun, rankPlayers } from './mythic-plus';
import {
  findGuild,
  guildLadder,
  guildLadderLink,
  guildOf,
  guildRankChanges,
  inGuild,
  previousOverallRank
} from './mythic-plus-guild';

function member(name: string, overrides: Partial<MythicPlusMember> = {}): MythicPlusMember {
  return { name, realm: 'Evermoon', guild: 'Skill Issue', class: 10, race: 1, gender: 0, spec: 'Windwalker', role: 'dps', ...overrides };
}

let nextId = 0;
function run(dungeon: string, score: number, roster: MythicPlusMember[], clearTimeSeconds = 1500): MythicPlusRun {
  return {
    id: `${dungeon}-${++nextId}`, dungeon, keyLevel: 15, clearTimeSeconds, score,
    completedAt: '2026-10-01T20:00:00Z', affixes: [], roster
  };
}

describe('guild links', () => {
  it('builds the guild path from the realm slug and the name as it is', () => {
    expect(guildLadderLink({ name: 'Cara Máxima', realm: 'Tauri' })).toEqual(['/mythic-plus', 'guild', 'tauri', 'Cara Máxima']);
    expect(guildLadderLink({ name: 'Искатели легенд', realm: 'WoD' })[2]).toBe('wod');
  });

  it('gives a guildless character no guild', () => {
    expect(guildOf(member('Solo', { guild: undefined }))).toBeUndefined();
    expect(guildOf(member('Dksmus'))).toEqual({ name: 'Skill Issue', realm: 'Evermoon' });
  });
});

describe('inGuild', () => {
  const isMember = inGuild({ name: 'Larp pour larp', realm: 'Evermoon' });

  it('keeps the guild on its own realm only', () => {
    expect(isMember(member('A', { guild: 'Larp pour larp' }))).toBe(true);
    expect(isMember(member('B', { guild: 'Larp pour larp', realm: 'Tauri' }))).toBe(false);
  });

  it('needs the exact name, and leaves out the guildless', () => {
    expect(isMember(member('C', { guild: 'Larp Pour Larp' }))).toBe(false);
    expect(isMember(member('D', { guild: undefined }))).toBe(false);
  });
});

describe('findGuild', () => {
  const characters = [
    member('A', { guild: 'Legio Immortalis' }),
    member('B', { guild: 'Legio Immortalis', realm: 'Tauri' }),
    member('C', { guild: 'Søul Øf Gløry' }),
    member('D', { guild: 'Искатели легенд', realm: 'WoD' }),
    member('E', { guild: undefined })
  ];

  it('finds the guild on the realm the URL names', () => {
    expect(findGuild(characters, 'evermoon', 'Legio Immortalis')).toEqual({ name: 'Legio Immortalis', realm: 'Evermoon' });
    expect(findGuild(characters, 'TAURI', 'Legio Immortalis')).toEqual({ name: 'Legio Immortalis', realm: 'Tauri' });
  });

  it('falls back to a case-insensitive match, written as the guild writes it', () => {
    expect(findGuild(characters, 'evermoon', 'søul øf gløry')).toEqual({ name: 'Søul Øf Gløry', realm: 'Evermoon' });
    expect(findGuild(characters, 'wod', 'ИСКАТЕЛИ ЛЕГЕНД')).toEqual({ name: 'Искатели легенд', realm: 'WoD' });
  });

  it('prefers the exact name when two guilds differ only by case', () => {
    const clash = [member('A', { guild: 'Crows' }), member('B', { guild: 'CROWS' })];
    expect(findGuild(clash, 'evermoon', 'CROWS')).toEqual({ name: 'CROWS', realm: 'Evermoon' });
  });

  it('finds nothing on another realm or for an unknown guild', () => {
    expect(findGuild(characters, 'wod', 'Legio Immortalis')).toBeUndefined();
    expect(findGuild(characters, 'evermoon', 'Nobody')).toBeUndefined();
    expect(findGuild(characters, 'evermoon', '')).toBeUndefined();
  });
});

describe('guildLadder', () => {
  const dksmus = member('Dksmus');
  const polan = member('Polán', { class: 6, spec: 'Unholy' });
  const outsider = member('Outsider', { guild: 'A Murder of Crows' });
  const other = member('Twin', { realm: 'Tauri' });
  const runs = [
    run('nl', 160, [outsider, dksmus]),
    run('dht', 150, [polan, outsider]),
    run('nl', 140, [polan, other]),
    run('dht', 120, [dksmus])
  ];
  const ranking = rankPlayers(runs);

  it('renumbers the ranks within the guild and keeps the overall ones', () => {
    const ladder = guildLadder(ranking, { name: 'Skill Issue', realm: 'Evermoon' });

    expect(ladder.map(entry => entry.player.key)).toEqual(['Polán|Evermoon', 'Dksmus|Evermoon']);
    expect(ladder.map(entry => entry.rank)).toEqual([1, 2]);
    expect(ladder.map(entry => entry.overallRank)).toEqual([2, 3]);
    expect(ladder.map(entry => entry.overallPosition)).toEqual([2, 3]);
  });

  it('scores members on every run they played, as the leaderboard does', () => {
    const ladder = guildLadder(ranking, { name: 'Skill Issue', realm: 'Evermoon' });
    const overall = new Map(ranking.map(player => [player.key, player.score]));

    expect(ladder.map(entry => entry.player.score)).toEqual(ladder.map(entry => overall.get(entry.player.key)));
    expect(ladder[0].player.score).toBe(290);
  });

  it('is the same ladder as ranking with the guild as the include filter', () => {
    const guild = { name: 'Skill Issue', realm: 'Evermoon' };
    const included = rankPlayers(runs, inGuild(guild));

    expect(guildLadder(ranking, guild).map(entry => [entry.player.key, entry.player.score]))
      .toEqual(included.map(player => [player.key, player.score]));
  });

  it('shares a guild rank on the same score and total time', () => {
    const a = member('A');
    const b = member('B');
    const c = member('C');
    const tied = rankPlayers([run('nl', 150, [a, b]), run('nl', 100, [c]), run('nl', 200, [outsider])]);

    const ladder = guildLadder(tied, { name: 'Skill Issue', realm: 'Evermoon' });
    expect(ladder.map(entry => entry.rank)).toEqual([1, 1, 3]);
    expect(ladder.map(entry => entry.overallRank)).toEqual([2, 2, 4]);
    expect(ladder.map(entry => entry.overallPosition)).toEqual([2, 3, 4]);
  });

  it('is empty for a guild nobody in the ranking is in', () => {
    expect(guildLadder(ranking, { name: 'Skill Issue', realm: 'WoD' })).toEqual([]);
  });
});

describe('previousOverallRank', () => {
  it('adds the rank change back: a climb came from further down', () => {
    expect(previousOverallRank([1500, 12, 30.5, 4])).toBe(16);
    expect(previousOverallRank([1500, 12, -3, -2])).toBe(10);
    expect(previousOverallRank([1500, 12, 0, 0])).toBe(12);
  });

  it('has none for a character new since the last scan', () => {
    expect(previousOverallRank([1500, 12])).toBeUndefined();
    expect(previousOverallRank(undefined)).toBeUndefined();
  });
});

describe('guildRankChanges', () => {
  it('orders the guild by the previous overall ranks for its previous guild ranks', () => {
    const changes = guildRankChanges([
      { key: 'B', rank: 1, previousOverallRank: 40 },
      { key: 'A', rank: 2, previousOverallRank: 25 },
      { key: 'C', rank: 3, previousOverallRank: 300 }
    ]);

    expect(changes).toEqual(new Map([['B', 1], ['A', -1], ['C', 0]]));
  });

  it('leaves out members new since the last scan, who push the others down', () => {
    const changes = guildRankChanges([
      { key: 'New', rank: 1 },
      { key: 'A', rank: 2, previousOverallRank: 25 },
      { key: 'B', rank: 3, previousOverallRank: 40 }
    ]);

    expect(changes.has('New')).toBe(false);
    expect(changes).toEqual(new Map([['A', -1], ['B', -1]]));
  });

  it('shares a previous guild rank on the same previous overall rank', () => {
    const changes = guildRankChanges([
      { key: 'A', rank: 1, previousOverallRank: 10 },
      { key: 'B', rank: 2, previousOverallRank: 10 },
      { key: 'C', rank: 2, previousOverallRank: 5 }
    ]);

    expect(changes).toEqual(new Map([['C', -1], ['A', 1], ['B', 0]]));
  });

  it('is empty without any previous ranks', () => {
    expect(guildRankChanges([{ key: 'A', rank: 1 }]).size).toBe(0);
    expect(guildRankChanges([]).size).toBe(0);
  });
});
