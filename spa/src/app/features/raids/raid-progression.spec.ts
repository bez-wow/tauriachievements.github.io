import { describe, expect, it } from 'vitest';
import {
  GuildProgress,
  ProgressionFilter,
  fastestKills,
  filterProgression,
  guildProgression,
  progressionChanges,
  speedRank
} from './raid-progression';
import { RaidGuild, RaidKill } from './raid-logs.types';
import { index, nythendra } from './raid-logs.fixture';

describe('guildProgression', () => {
  it('ranks the most bosses down first, then who got there first', () => {
    const heroic = guildProgression(index.kills, 15, index.bosses.length);
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

describe('filterProgression', () => {
  it('keeps one faction or realm and ranks the guilds left among themselves', () => {
    const rows: GuildProgress[] = [['A', 'Evermoon', 1], ['B', 'Tauri', 0], ['C', 'Evermoon', 0], ['D', 'WoD', 1]]
      .map(([name, realm, faction], position) => ({
        rank: position + 1,
        guild: { name: name as string, realm: realm as string, faction: faction as number, id: position },
        firsts: [],
        killed: 0,
        progressedAt: 0,
        kills: 0
      }));
    const shown = (filter: ProgressionFilter) => filterProgression(rows, filter).map(row => `${row.rank} ${row.guild.name}`);

    expect(shown({})).toEqual(['1 A', '2 B', '3 C', '4 D']);
    expect(shown({ faction: 0 })).toEqual(['1 B', '2 C']);
    expect(shown({ realm: 'evermoon' })).toEqual(['1 A', '2 C']);
    expect(shown({ faction: 1, realm: 'wod' })).toEqual(['1 D']);
    expect(shown({ faction: 0, realm: 'wod' })).toEqual([]);
    expect(rows.map(row => row.rank)).toEqual([1, 2, 3, 4]);
  });
});

describe('progressionChanges', () => {
  it('marks a guild new to the difficulty, and the bosses another guild killed since the last scan', () => {
    const guild = (name: string, id: number): RaidGuild => ({ name, realm: 'Evermoon', faction: 1, id });
    const [miracle, outlaws, newcomers] = [guild('Miracle', 1), guild('Outlaws', 2), guild('Newcomers', 3)];
    const kill = (logId: number, boss: number, by: RaidGuild): RaidKill =>
      ({ ...index.kills[0], logId, boss: index.bosses[boss], guild: by, killedAt: logId * 1_000 });
    const before = [kill(1, 0, miracle), kill(2, 0, outlaws)];
    const latest = [kill(3, 1, miracle), kill(4, 0, outlaws), kill(5, 0, newcomers)];
    const progression = (kills: RaidKill[]) => guildProgression(kills, 16, index.bosses.length);

    const changes = progressionChanges(progression([...before, ...latest]), progression(before));

    expect([...changes].map(([key, change]) => [key, change.isNew, [...change.bosses]])).toEqual([
      ['evermoon/Miracle', false, [1]],
      ['evermoon/Newcomers', true, [0]]
    ]);
  });

  it('finds nothing when the scan added no kill', () => {
    const rows = guildProgression(index.kills, 16, index.bosses.length);
    expect(progressionChanges(rows, rows).size).toBe(0);
  });
});

describe('fastestKills and speedRank', () => {
  it('orders by fight time, the earlier kill first on a tie', () => {
    const heroic = index.kills.filter(kill => kill.difficulty.id === 15 && kill.boss === nythendra);
    expect(fastestKills(heroic).map(kill => kill.logId)).toEqual([13, 10]);
    expect(speedRank({ realm: 'WoD', logId: 10 }, heroic)).toBe(2);
  });
});
