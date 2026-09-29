import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LadderQuery, LadderService, RankedLadderPlayer } from './ladder.service';
import { LadderSort } from './ladder.types';
import { Player, PlayerRankings } from './models/character.model';
import { DataSyncService } from './services/data-sync.service';
import { makePlayer } from './testing/player.fixture';

// Mirrors scripts/player-ranking.js, which ships these rules inside the snapshot.
const RANKINGS: PlayerRankings = {
  achievementPoints: ['achievementPoints', 'honorableKills'],
  honorableKills: ['honorableKills', 'achievementPoints'],
  achievementsTotal: ['achievementsTotal', 'achievementPoints', 'honorableKills'],
  playedTime: ['playedTime', 'achievementPoints', 'honorableKills'],
  appearanceCount: ['appearanceCount', 'achievementPoints', 'honorableKills'],
  ilvl: ['ilvl', 'achievementPoints', 'honorableKills']
};

/** Players must be given in achievement-point rank order, as the snapshot stores them. */
function serviceWith(players: Player[]): LadderService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DataSyncService, useValue: { getDataset: () => of({ players, rankings: RANKINGS }) } }
    ]
  });

  return TestBed.inject(LadderService);
}

function collect(service: LadderService, sort: LadderSort, query: Partial<LadderQuery> = {}): Player[] {
  let result: Player[] = [];
  service.getLadder(sort, { limit: 100, ...query }).subscribe((value) => (result = value));
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

function rankDeltaByName(rows: Player[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.name, row.achievementRankDelta]));
}

describe('LadderService rank movement', () => {
  it('recomputes the rank delta within a class filter', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints', { playerClass: 2 });

    expect(rows.map((row) => row.name)).toEqual(['A', 'B', 'C']);
    expect(rankDeltaByName(rows)).toEqual({ A: 0, B: 1, C: -1 });
  });

  it('keeps the precomputed global rank delta when no population filter is active', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints');

    expect(rankDeltaByName(rows)).toEqual({ A: 50, M: 50, B: 99, C: -7 });
  });

  it('does not recompute for a search-only query (search does not define a cohort)', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints', { search: 'B' });

    expect(rows.map((row) => row.name)).toEqual(['B']);
    expect(rows[0].achievementRankDelta).toBe(99);
  });

  it('narrows visible rows by search while still ranking against the full cohort', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints', { playerClass: 2, search: 'B' });

    expect(rows.map((row) => row.name)).toEqual(['B']);
    expect(rows[0].achievementRankDelta).toBe(1);
  });

  it('gives a brand-new character no rank movement and does not disturb stable players', () => {
    const players = [
      makePlayer({ name: 'A', class: 2, achievementPoints: 1000, achievementPointsDelta: 0 }),
      makePlayer({ name: 'C', class: 2, achievementPoints: 800, achievementPointsDelta: 0 }),
      makePlayer({ name: 'New', class: 2, achievementPoints: 700, achievementPointsDelta: 0, isNewCharacter: true })
    ];
    const rows = collect(serviceWith(players), 'achievementPoints', { playerClass: 2 });

    expect(rankDeltaByName(rows)).toEqual({ A: 0, C: 0, New: 0 });
  });

  it('filters the returned cohort to the requested class', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints', { playerClass: 2 });

    expect(rows.every((row) => row.class === 2)).toBe(true);
  });

  it('recomputes the honorable-kills rank delta within a class filter', () => {
    const players = [
      makePlayer({ name: 'A', class: 2, honorableKills: 1000, honorableKillsDelta: 0, honorableKillsRankDelta: 42 }),
      makePlayer({ name: 'B', class: 2, honorableKills: 900, honorableKillsDelta: 200, honorableKillsRankDelta: 42 }),
      makePlayer({ name: 'C', class: 2, honorableKills: 800, honorableKillsDelta: 0, honorableKillsRankDelta: 42 })
    ];
    const rows = collect(serviceWith(players), 'honorableKills', { playerClass: 2 });

    expect(rows.map((row) => row.name)).toEqual(['A', 'B', 'C']);
    expect(Object.fromEntries(rows.map((row) => [row.name, row.honorableKillsRankDelta]))).toEqual({ A: 0, B: 1, C: -1 });
  });

  it('sorts appearances and recomputes appearance rank delta within a class filter', () => {
    const players = [
      makePlayer({ name: 'A', class: 2, appearanceCount: 1000, appearanceCountDelta: 0, appearanceRankDelta: 42 }),
      makePlayer({ name: 'B', class: 2, appearanceCount: 900, appearanceCountDelta: 200, appearanceRankDelta: 42 }),
      makePlayer({ name: 'C', class: 2, appearanceCount: 800, appearanceCountDelta: 0, appearanceRankDelta: 42 })
    ];
    const rows = collect(serviceWith(players), 'appearanceCount', { playerClass: 2 });

    expect(rows.map((row) => row.name)).toEqual(['A', 'B', 'C']);
    expect(Object.fromEntries(rows.map((row) => [row.name, row.appearanceRankDelta]))).toEqual({ A: 0, B: 1, C: -1 });
  });
});

describe('LadderService limits', () => {
  it('returns at most the requested number of rows in the unfiltered view', () => {
    expect(collect(serviceWith(cohortFixture()), 'achievementPoints', { limit: 2 }).map((row) => row.name)).toEqual(['A', 'M']);
  });

  it('limits within a filtered cohort', () => {
    const rows = collect(serviceWith(cohortFixture()), 'achievementPoints', { playerClass: 2, limit: 2 });

    expect(rows.map((row) => row.name)).toEqual(['A', 'B']);
  });
});

describe('LadderService rankings', () => {
  it('orders by the shipped ranking and keeps achievement-point order for full ties', () => {
    // Snapshot order (achievement points): Alpha, Bravo, Charlie. Bravo and Charlie tie on
    // played time, points and kills, so they keep that order - the build's key tie-break.
    const players = [
      makePlayer({ name: 'Alpha', achievementPoints: 300, playedTime: 10 }),
      makePlayer({ name: 'Bravo', achievementPoints: 200, playedTime: 50 }),
      makePlayer({ name: 'Charlie', achievementPoints: 200, playedTime: 50 })
    ];

    expect(collect(serviceWith(players), 'playedTime').map((row) => row.name)).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('does not reorder or copy players for the achievement-point ladder', () => {
    const players = [makePlayer({ name: 'First' }), makePlayer({ name: 'Second', achievementPoints: 999 })];

    const rows = collect(serviceWith(players), 'achievementPoints');

    expect(rows.map((row) => row.name)).toEqual(['First', 'Second']);
    expect(rows[0]).toBe(players[0]);
  });
});

describe('LadderService.getRankedPlayer', () => {
  function rankedFixture(): Player[] {
    return [
      makePlayer({ name: 'Top', realm: 'Tauri', achievementPoints: 1000, honorableKills: 10 }),
      makePlayer({ name: 'Mid', realm: 'Evermoon', achievementPoints: 900, honorableKills: 50 }),
      makePlayer({ name: 'Low', realm: 'Tauri', achievementPoints: 800, honorableKills: 90 })
    ];
  }

  function resolve(service: LadderService, name: string, realm: string): RankedLadderPlayer | undefined {
    let result: RankedLadderPlayer | undefined;
    service.getRankedPlayer(name, realm).subscribe((value) => (result = value));
    return result;
  }

  it('returns the global achievement and honorable-kill ranks for a player', () => {
    const player = resolve(serviceWith(rankedFixture()), 'Mid', 'Evermoon');

    expect(player?.achievementRank).toBe(2);
    expect(player?.honorableKillRank).toBe(2);
  });

  it('ranks the highest honorable kills as rank 1 independently of achievement order', () => {
    const player = resolve(serviceWith(rankedFixture()), 'Low', 'Tauri');

    expect(player?.achievementRank).toBe(3);
    expect(player?.honorableKillRank).toBe(1);
  });

  it('matches name and realm case-insensitively', () => {
    const player = resolve(serviceWith(rankedFixture()), 'top', 'tauri');

    expect(player?.name).toBe('Top');
    expect(player?.achievementRank).toBe(1);
  });

  it('returns undefined when the character is not on the ladder', () => {
    expect(resolve(serviceWith(rankedFixture()), 'Ghost', 'Tauri')).toBeUndefined();
  });
});
