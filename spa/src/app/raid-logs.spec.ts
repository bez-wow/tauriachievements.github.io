import { describe, expect, it } from 'vitest';
import {
  RaidBossFile,
  RaidLogsIndexFile,
  decodeBossFile,
  decodeIndex,
  defaultDifficulty,
  fastestKills,
  formatAgo,
  formatAmount,
  formatFightTime,
  formatPerSecond,
  guildProgression,
  nameMatches,
  rankCharacters,
  raidLogLink,
  speedRank
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
