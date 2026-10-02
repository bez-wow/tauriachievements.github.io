import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, map, of } from 'rxjs';
import { DEFAULT_LADDER_FILTER_STATE } from './ladder-filter-state';
import { LadderPageStore } from './ladder-page.store';
import { LadderService } from './ladder.service';
import { RareAchievementsService } from './rare-achievements.service';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { Player } from './models/character.model';

/**
 * Stands in for the real two-stage loader so the tests can watch which stage the store
 * asks for. Only the surface LadderPageStore touches is implemented.
 */
class FakeDataSyncService {
  readonly players$ = new BehaviorSubject<Player[]>([]);
  readonly complete$ = new BehaviorSubject<boolean>(false);
  readonly progress$ = new BehaviorSubject({ isLoading: false, current: 0, total: 0, message: '' });

  /** Held open so a test can observe the window where the head cannot answer the view yet. */
  private resolveComplete?: () => void;

  /** The head slice the fake "loads": enough players for the store to treat the head as present. */
  readonly headPlayers = [
    { name: 'Larahh', guild: '', realm: 'Tauri', race: 4, gender: 1, class: 11, isNewCharacter: false } as Player
  ];

  syncData = vi.fn(async () => {
    this.players$.next(this.headPlayers);
  });

  ensureCompleteData = vi.fn(() => new Promise<void>((resolve) => {
    this.resolveComplete = () => {
      this.complete$.next(true);
      resolve();
    };
  }));

  finishCompleteLoad(): Promise<void> {
    this.resolveComplete?.();
    return Promise.resolve();
  }

  getPlayers() { return this.players$.asObservable(); }
  getTotalPlayerCount() { return of(204807); }
  getSyncProgress() { return this.progress$.asObservable(); }
  getCurrentPlayers() { return this.players$.value; }
  isDatasetComplete() { return this.complete$.asObservable(); }
  isCurrentDatasetComplete() { return this.complete$.value; }
}

/** Answers every query with `matchCount` players, so a test can set how many matches the head has. */
function fakeLadderService(dataSync: FakeDataSyncService, matches: { count: number }) {
  return {
    getLadder: () => dataSync.players$.pipe(
      map((players) => players.length === 0 ? [] : Array.from({ length: matches.count }, () => players[0]))
    )
  };
}

describe('LadderPageStore dataset escalation', () => {
  let dataSync: FakeDataSyncService;
  let store: LadderPageStore;
  let headMatches: { count: number };

  beforeEach(() => {
    dataSync = new FakeDataSyncService();
    headMatches = { count: 100 };

    TestBed.configureTestingModule({
      providers: [
        LadderPageStore,
        { provide: DataSyncService, useValue: dataSync },
        { provide: LadderService, useValue: fakeLadderService(dataSync, headMatches) },
        { provide: RareAchievementsService, useValue: { getRareAchievementIndicators: () => of(new Map()) } },
        { provide: LadderLastUpdatedService, useValue: { getLastUpdated: () => of(null) } }
      ]
    });

    store = TestBed.inject(LadderPageStore);
  });

  it('loads only the head snapshot for the default view', async () => {
    store.setFilterState(DEFAULT_LADDER_FILTER_STATE);
    store.initialize();
    await Promise.resolve();

    expect(dataSync.syncData).toHaveBeenCalled();
    expect(dataSync.ensureCompleteData).not.toHaveBeenCalled();
  });

  it('folds a deep-linked filter into a single full load rather than fetching twice', async () => {
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, realm: 'Tauri' });
    store.initialize();
    await Promise.resolve();

    expect(dataSync.ensureCompleteData).toHaveBeenCalled();
    expect(dataSync.syncData).not.toHaveBeenCalled();
  });

  it('answers a search from the head alone when the head fills the page', async () => {
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'lar' });
    store.initialize();
    await Promise.resolve();

    expect(dataSync.syncData).toHaveBeenCalled();
    expect(dataSync.ensureCompleteData).not.toHaveBeenCalled();
    expect(store.players()).toHaveLength(100);
    expect(store.isSearchingAllPlayers()).toBe(false);
    expect(store.isAwaitingCompleteDataset()).toBe(false);
  });

  it('shows the head matches and searches every player when the head runs out', async () => {
    headMatches.count = 78;
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'xy' });
    store.initialize();
    await Promise.resolve();

    expect(store.players()).toHaveLength(78);
    expect(store.isSearchingAllPlayers()).toBe(true);
    expect(store.isAwaitingCompleteDataset()).toBe(false);
    expect(dataSync.ensureCompleteData).toHaveBeenCalledTimes(1);

    await dataSync.finishCompleteLoad();
    expect(store.isSearchingAllPlayers()).toBe(false);
  });

  it('reports a failed search of every player and leaves the head matches up', async () => {
    headMatches.count = 3;
    dataSync.ensureCompleteData.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'xy' });
    store.initialize();
    await new Promise((resolve) => setTimeout(resolve));

    expect(store.players()).toHaveLength(3);
    expect(store.isSearchingAllPlayers()).toBe(false);
    expect(store.loadError()).toContain('search every character');
    expect(dataSync.ensureCompleteData).toHaveBeenCalledTimes(1);

    // "Try again" searches every player again.
    await store.syncData();
    expect(dataSync.ensureCompleteData).toHaveBeenCalledTimes(2);
    expect(store.isSearchingAllPlayers()).toBe(true);
    expect(store.loadError()).toBeUndefined();
  });

  it('upgrades to the full dataset when a filter is applied after the head has loaded', async () => {
    store.setFilterState(DEFAULT_LADDER_FILTER_STATE);
    store.initialize();
    await Promise.resolve();
    expect(dataSync.ensureCompleteData).not.toHaveBeenCalled();

    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, realm: 'Tauri' });
    await Promise.resolve();

    expect(dataSync.ensureCompleteData).toHaveBeenCalled();
  });

  it('does not re-request the full dataset once it is loaded', async () => {
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, realm: 'Tauri' });
    store.initialize();
    await dataSync.finishCompleteLoad();
    expect(dataSync.ensureCompleteData).toHaveBeenCalledTimes(1);

    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, sort: 'honorableKills' });
    await Promise.resolve();

    expect(dataSync.ensureCompleteData).toHaveBeenCalledTimes(1);
  });

  it('withholds results while the head cannot answer the current view', async () => {
    store.setFilterState(DEFAULT_LADDER_FILTER_STATE);
    store.initialize();
    await Promise.resolve();
    expect(store.isAwaitingCompleteDataset()).toBe(false);

    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, sort: 'honorableKills' });
    expect(store.isAwaitingCompleteDataset()).toBe(true);

    await dataSync.finishCompleteLoad();
    expect(store.isAwaitingCompleteDataset()).toBe(false);
  });
});
