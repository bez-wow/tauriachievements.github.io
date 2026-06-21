import { describe, it, expect } from 'vitest';
import { computeStats } from './stats-page.component';
import { Player } from './models/character.model';

function makePlayer(overrides: Partial<Player>): Player {
  return {
    name: 'Anon',
    race: 1,
    gender: 0,
    class: 1,
    realm: 'Tauri',
    guild: 'Guild',
    achievementPoints: 0,
    achievementPointsDelta: 0,
    achievementRankDelta: 0,
    honorableKills: 0,
    honorableKillsDelta: 0,
    honorableKillsRankDelta: 0,
    appearanceCount: 0,
    appearanceCountDelta: 0,
    appearanceRankDelta: 0,
    isNewCharacter: false,
    faction: 'Horde',
    ...overrides
  };
}

function sampleRoster(): Player[] {
  return [
    makePlayer({ name: 'P1', faction: 'Horde', class: 2, race: 2, realm: 'Tauri', guild: 'G1', achievementPoints: 500, honorableKills: 0 }),
    makePlayer({ name: 'P2', faction: 'Horde', class: 2, race: 2, realm: 'Tauri', guild: 'G1', achievementPoints: 1000, honorableKills: 1000 }),
    makePlayer({ name: 'P3', faction: 'Alliance', class: 8, race: 1, realm: 'Evermoon', guild: '', achievementPoints: 20000, honorableKills: 100000 }),
    makePlayer({ name: 'P4', faction: 'Alliance', class: 8, race: 1, realm: 'Evermoon', guild: 'G2', achievementPoints: 6000, honorableKills: 5000 })
  ];
}

describe('computeStats', () => {
  it('returns zeroed stats for an empty roster, keeping bucket arrays sized', () => {
    const stats = computeStats([]);

    expect(stats.totalPlayers).toBe(0);
    expect(stats.avgAchievementPoints).toBe(0);
    expect(stats.classLabels).toEqual([]);
    expect(stats.apBucketCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(stats.hkBucketCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(stats.apBucketLabels.length).toBe(stats.apBucketCounts.length);
  });

  it('computes totals, rounded averages, and maximums', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.totalPlayers).toBe(4);
    expect(stats.avgAchievementPoints).toBe(6875);
    expect(stats.maxAchievementPoints).toBe(20000);
    expect(stats.avgHonorableKills).toBe(26500);
    expect(stats.maxHonorableKills).toBe(100000);
  });

  it('counts guilded players and unique guilds keyed by guild + realm', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.guildedPlayers).toBe(3);
    expect(stats.uniqueGuilds).toBe(2);
  });

  it('orders factions Horde, Alliance, then others', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.factionLabels).toEqual(['Horde', 'Alliance']);
    expect(stats.factionCounts).toEqual([2, 2]);
  });

  it('buckets achievement points by threshold, lower bound inclusive', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.apBucketLabels).toEqual(['<1k', '1k–3k', '3k–6k', '6k–10k', '10k–15k', '15k–20k', '20k+']);
    expect(stats.apBucketCounts).toEqual([1, 1, 0, 1, 0, 0, 1]);
  });

  it('buckets honorable kills by threshold, lower bound inclusive', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.hkBucketCounts).toEqual([1, 1, 1, 0, 0, 0, 1]);
  });

  it('labels classes and races and keeps their counts', () => {
    const stats = computeStats(sampleRoster());

    expect(stats.classLabels).toContain('Paladin');
    expect(stats.classLabels).toContain('Mage');
    expect(stats.classCounts).toEqual([2, 2]);
    expect(stats.raceLabels).toContain('Orc');
    expect(stats.raceLabels).toContain('Human');
  });

  it('puts the most populous guild first', () => {
    const stats = computeStats([
      ...sampleRoster(),
      makePlayer({ name: 'P5', realm: 'Evermoon', guild: 'G2' }),
      makePlayer({ name: 'P6', realm: 'Evermoon', guild: 'G2' })
    ]);

    expect(stats.guildLabels[0]).toBe('G2 (Evermoon)');
    expect(stats.guildCounts[0]).toBe(3);
  });
});
