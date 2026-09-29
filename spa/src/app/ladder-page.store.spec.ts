import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
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

  syncData = vi.fn(async () => {
    this.players$.next([]);
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
  getSyncProgress() { return this.progress$.asObservable(); }
  getCurrentPlayers() { return this.players$.value; }
  isDatasetComplete() { return this.complete$.asObservable(); }
  isCurrentDatasetComplete() { return this.complete$.value; }
}

function fakeLadderService() {
  const page = () => of([]);

  return {
    getAchievements: page,
    getAccountWideAchievements: page,
    getHonorableKills: page,
    getPlaytime: page,
    getAppearances: page,
    getItemLevel: page
  };
}

describe('LadderPageStore dataset escalation', () => {
  let dataSync: FakeDataSyncService;
  let store: LadderPageStore;

  beforeEach(() => {
    dataSync = new FakeDataSyncService();

    TestBed.configureTestingModule({
      providers: [
        LadderPageStore,
        { provide: DataSyncService, useValue: dataSync },
        { provide: LadderService, useValue: fakeLadderService() },
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

  it('folds a deep-linked search into a single full load rather than fetching twice', async () => {
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'yolko' });
    store.initialize();
    await Promise.resolve();

    expect(dataSync.ensureCompleteData).toHaveBeenCalled();
    expect(dataSync.syncData).not.toHaveBeenCalled();
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
    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'yolko' });
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

    store.setFilterState({ ...DEFAULT_LADDER_FILTER_STATE, search: 'yolko' });
    expect(store.isAwaitingCompleteDataset()).toBe(true);

    await dataSync.finishCompleteLoad();
    expect(store.isAwaitingCompleteDataset()).toBe(false);
  });
});
