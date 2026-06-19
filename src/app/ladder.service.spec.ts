import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { LadderService, LadderAchievement } from './ladder.service';
import { DataSyncService } from './services/data-sync.service';
import { Player } from './models/character.model';

function makePlayer(overrides: Partial<Player>): Player {
  return {
    name: 'Anon',
    race: 1,
    gender: 0,
    class: 2,
    realm: 'Tauri',
    guild: 'Guild',
    achievementPoints: 0,
    achievementPointsDelta: 0,
    achievementRankDelta: 0,
    honorableKills: 0,
    honorableKillsDelta: 0,
    honorableKillsRankDelta: 0,
    isNewCharacter: false,
    faction: 'Alliance',
    ...overrides
  };
}

function serviceWith(players: Player[]): LadderService {
  const dataSync = { getPlayers: () => of(players) } as unknown as DataSyncService;
  return new LadderService(dataSync);
}

function collect(observable: ReturnType<LadderService['getAchievements']>): LadderAchievement[] {
  let result: LadderAchievement[] = [];
  observable.subscribe((value) => (result = value));
  return result;
}

function cohortFixture(): Player[] {
  return [
    makePlayer({ name: 'A', class: 2, achievementPoints: 1000, achievementPointsDelta: 0, achievementRankDelta: 50 }),
    makePlayer({ name: 'M', class: 8, achievementPoints: 950, achievementPointsDelta: 0, achievementRankDelta: 50 }),
    makePlayer({ name: 'B', class: 2, achievementPoints: 900, achievementPointsDelta: 200, achievementRankDelta: 99 }),
    makePlayer({ name: 'C', class: 2, achievementPoints: 800, achievementPointsDelta: 0, achievementRankDelta: -7 })
  ];
}

function rankDeltaByName(rows: LadderAchievement[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.name, row.achievementRankDelta]));
}

describe('LadderService rank movement', () => {
  it('recomputes the rank delta within a class filter', () => {
    const rows = collect(serviceWith(cohortFixture()).getAchievements(undefined, undefined, 2, '', 1, 100));

    expect(rows.map((row) => row.name)).toEqual(['A', 'B', 'C']);
    expect(rankDeltaByName(rows)).toEqual({ A: 0, B: 1, C: -1 });
  });

  it('keeps the precomputed global rank delta when no population filter is active', () => {
    const rows = collect(serviceWith(cohortFixture()).getAchievements(undefined, undefined, undefined, '', 1, 100));

    expect(rankDeltaByName(rows)).toEqual({ A: 50, M: 50, B: 99, C: -7 });
  });

  it('does not recompute for a search-only query (search does not define a cohort)', () => {
    const rows = collect(serviceWith(cohortFixture()).getAchievements(undefined, undefined, undefined, 'B', 1, 100));

    expect(rows.map((row) => row.name)).toEqual(['B']);
    expect(rows[0].achievementRankDelta).toBe(99);
  });

  it('narrows visible rows by search while still ranking against the full cohort', () => {
    const rows = collect(serviceWith(cohortFixture()).getAchievements(undefined, undefined, 2, 'B', 1, 100));

    expect(rows.map((row) => row.name)).toEqual(['B']);
    expect(rows[0].achievementRankDelta).toBe(1);
  });

  it('gives a brand-new character no rank movement and does not disturb stable players', () => {
    const players = [
      makePlayer({ name: 'A', class: 2, achievementPoints: 1000, achievementPointsDelta: 0 }),
      makePlayer({ name: 'C', class: 2, achievementPoints: 800, achievementPointsDelta: 0 }),
      makePlayer({ name: 'New', class: 2, achievementPoints: 700, achievementPointsDelta: 0, isNewCharacter: true })
    ];
    const rows = collect(serviceWith(players).getAchievements(undefined, undefined, 2, '', 1, 100));

    expect(rankDeltaByName(rows)).toEqual({ A: 0, C: 0, New: 0 });
  });

  it('filters the returned cohort to the requested class', () => {
    const rows = collect(serviceWith(cohortFixture()).getAchievements(undefined, undefined, 2, '', 1, 100));

    expect(rows.every((row) => row.class === 2)).toBe(true);
  });
});
