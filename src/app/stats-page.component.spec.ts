import { describe, it, expect } from 'vitest';
import { emptyStats, toServerStats } from './stats-page.component';
import { ServerStatsSnapshot } from './services/server-stats.service';

/**
 * The aggregation itself runs at build time and is covered by
 * scripts/compute-server-stats.test.js. What is left to test here is the mapping from
 * ids to the display names and colors this layer owns.
 */
function snapshot(overrides: Partial<ServerStatsSnapshot> = {}): ServerStatsSnapshot {
  return {
    totalPlayers: 4,
    guildedPlayers: 3,
    uniqueGuilds: 2,
    avgAchievementPoints: 6875,
    maxAchievementPoints: 20000,
    avgHonorableKills: 26500,
    maxHonorableKills: 100000,
    factions: [{ name: 'Horde', count: 2 }, { name: 'Alliance', count: 2 }],
    classes: [{ id: 2, count: 2 }, { id: 8, count: 2 }],
    races: [{ id: 2, count: 2 }, { id: 1, count: 2 }],
    guilds: [{ name: 'G1 (Tauri)', count: 2 }, { name: 'G2 (Evermoon)', count: 1 }],
    realms: [{ name: 'Tauri', count: 2 }, { name: 'Evermoon', count: 2 }],
    apBucketLabels: ['<1k', '1k–3k', '3k–6k', '6k–10k', '10k–15k', '15k–20k', '20k+'],
    apBucketCounts: [1, 1, 0, 1, 0, 0, 1],
    hkBucketLabels: ['<1k', '1k–5k', '5k–10k', '10k–25k', '25k–50k', '50k–100k', '100k+'],
    hkBucketCounts: [1, 1, 1, 0, 0, 0, 1],
    ...overrides
  };
}

describe('toServerStats', () => {
  it('carries the precomputed totals through unchanged', () => {
    const stats = toServerStats(snapshot());

    expect(stats.totalPlayers).toBe(4);
    expect(stats.guildedPlayers).toBe(3);
    expect(stats.uniqueGuilds).toBe(2);
    expect(stats.avgAchievementPoints).toBe(6875);
    expect(stats.maxAchievementPoints).toBe(20000);
    expect(stats.avgHonorableKills).toBe(26500);
    expect(stats.maxHonorableKills).toBe(100000);
  });

  it('names classes and races from their ids, preserving the given order', () => {
    const stats = toServerStats(snapshot());

    expect(stats.classLabels).toEqual(['Paladin', 'Mage']);
    expect(stats.classCounts).toEqual([2, 2]);
    expect(stats.raceLabels).toEqual(['Orc', 'Human']);
    expect(stats.raceCounts).toEqual([2, 2]);
  });

  it('pairs each class with its class color', () => {
    const stats = toServerStats(snapshot());

    expect(stats.classColors).toEqual(['#F48CBA', '#68CCEF']);
  });

  it('falls back to a readable label and a neutral color for an unknown class or race', () => {
    const stats = toServerStats(snapshot({
      classes: [{ id: 99, count: 1 }],
      races: [{ id: 77, count: 1 }]
    }));

    expect(stats.classLabels).toEqual(['Class 99']);
    expect(stats.classColors).toEqual(['#888']);
    expect(stats.raceLabels).toEqual(['Race 77']);
  });

  it('splits the named counts into the parallel label and count arrays the charts take', () => {
    const stats = toServerStats(snapshot());

    expect(stats.factionLabels).toEqual(['Horde', 'Alliance']);
    expect(stats.factionCounts).toEqual([2, 2]);
    expect(stats.realmLabels).toEqual(['Tauri', 'Evermoon']);
    expect(stats.realmCounts).toEqual([2, 2]);
    expect(stats.guildLabels).toEqual(['G1 (Tauri)', 'G2 (Evermoon)']);
    expect(stats.guildCounts).toEqual([2, 1]);
  });

  it('passes the bucket labels through with their counts, since neither means anything alone', () => {
    const stats = toServerStats(snapshot());

    expect(stats.apBucketLabels).toEqual(['<1k', '1k–3k', '3k–6k', '6k–10k', '10k–15k', '15k–20k', '20k+']);
    expect(stats.apBucketCounts).toEqual([1, 1, 0, 1, 0, 0, 1]);
    expect(stats.hkBucketCounts).toEqual([1, 1, 1, 0, 0, 0, 1]);
  });
});

describe('emptyStats', () => {
  it('reads as "no data" so the page shows its loading state before the fetch lands', () => {
    expect(emptyStats().totalPlayers).toBe(0);
  });

  it('provides every array the template indexes into', () => {
    const stats = emptyStats();

    expect(stats.factionLabels).toEqual([]);
    expect(stats.classLabels).toEqual([]);
    expect(stats.realmLabels).toEqual([]);
    expect(stats.realmCounts).toEqual([]);
  });

  it('has the same keys as a populated result', () => {
    expect(Object.keys(emptyStats()).sort()).toEqual(Object.keys(toServerStats(snapshot())).sort());
  });
});
