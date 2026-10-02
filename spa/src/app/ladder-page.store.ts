import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import {
  DEFAULT_LADDER_FILTER_STATE,
  areLadderFilterStatesEqual,
  isHeadFirstSearch,
  requiresCompleteLadderDataset
} from './ladder-filter-state';
import { mapLadderPlayersToView } from './ladder-player-view.mapper';
import { LadderService } from './ladder.service';
import { LadderFilterState, LadderPlayerView } from './ladder.types';
import { Player } from './models/character.model';
import { RareAchievementSummary } from './rare-achievements.types';
import { RareAchievementsService } from './rare-achievements.service';
import { DataSyncService } from './services/data-sync.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';

@Injectable()
export class LadderPageStore {
  private readonly ladderService = inject(LadderService);
  private readonly dataSyncService = inject(DataSyncService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly rareAchievementsService = inject(RareAchievementsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterState$ = new BehaviorSubject<LadderFilterState>(DEFAULT_LADDER_FILTER_STATE);
  private readonly sourcePlayerCount = signal(this.dataSyncService.getCurrentPlayers().length);
  private hasStartedSync = false;
  private initialized = false;
  private readonly rareAchievementIndicators$ = this.rareAchievementsService.getRareAchievementIndicators().pipe(
    catchError((error: unknown) => {
      console.error('Failed to load rare achievement indicators:', error);
      return of(new Map<string, RareAchievementSummary>());
    }),
    startWith(new Map<string, RareAchievementSummary>())
  );

  readonly players = signal<LadderPlayerView[]>([]);
  readonly isLoading = signal(this.sourcePlayerCount() === 0);
  readonly syncMessage = signal(this.isLoading() ? 'Loading ladder data...' : '');
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly hasSourcePlayers = computed(() => this.sourcePlayerCount() > 0);
  readonly isDatasetComplete = signal(this.dataSyncService.isCurrentDatasetComplete());
  readonly totalPlayerCount = signal(0);
  readonly loadedPlayerCount = this.sourcePlayerCount.asReadonly();

  /**
   * A search on the default ladder shows the head's matches at once (they are the first rows of
   * the full answer) and is still searching the rest of the server for the rows it lacks.
   */
  readonly isSearchingAllPlayers = signal(false);
  private searchLoad?: Promise<void>;
  private searchLoadFailed = false;
  private readonly needsCompleteDataset = signal(requiresCompleteLadderDataset(DEFAULT_LADDER_FILTER_STATE));

  /**
   * The head slice cannot answer this view yet. Results computed against it would be
   * plausible but wrong, so the page shows its loading state rather than publishing them.
   */
  readonly isAwaitingCompleteDataset = computed(() => this.needsCompleteDataset() && !this.isDatasetComplete());

  constructor() {
    this.bindSourcePlayers();
    this.bindSyncProgress();
    this.bindFilteredPlayers();
    this.bindDatasetCompleteness();
    this.bindTotalPlayerCount();
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.loadLastUpdated();
    void this.syncData();
  }

  setFilterState(state: LadderFilterState): void {
    this.filterState$.next(state);
    this.needsCompleteDataset.set(requiresCompleteLadderDataset(state));

    // Before initialize() the upgrade is folded into the first load instead, so a deep
    // link straight to a search or a sort costs one request rather than two.
    if (this.initialized && this.needsCompleteDataset() && !this.isDatasetComplete()) {
      void this.syncData();
    }
  }

  async syncData(): Promise<void> {
    this.hasStartedSync = true;
    this.loadError.set(undefined);
    // This is also the "Try again" after a failed search of every player.
    this.searchLoadFailed = false;

    if (!this.hasSourcePlayers()) {
      this.isLoading.set(true);
      this.syncMessage.set('Loading ladder data...');
    }

    try {
      if (this.needsCompleteDataset()) {
        await this.dataSyncService.ensureCompleteData();
      } else {
        await this.dataSyncService.syncData();
      }

      // The head is in: check whether the current search still needs the rest of the server.
      // (loadError was cleared above; clearing it again here would hide a failed search load.)
      this.searchRestOfServerIfNeeded(this.filterState$.value, this.players().length);
    } catch (error) {
      console.error('Failed to sync data:', error);
      this.loadError.set('We could not load the ladder right now. Please try again in a moment.');
      this.isLoading.set(false);
      this.syncMessage.set('');
    }
  }

  /**
   * After a head-first search, loads every player when the head did not fill the page.
   * Until then the head's matches stay on screen, flagged by isSearchingAllPlayers.
   */
  private searchRestOfServerIfNeeded(state: LadderFilterState, resultCount: number): void {
    const needsRest = isHeadFirstSearch(state)
      && this.hasSourcePlayers()
      && !this.dataSyncService.isCurrentDatasetComplete()
      && resultCount < state.pageSize;

    // A failed load is retried only from "Try again" (syncData), not on every keystroke.
    this.isSearchingAllPlayers.set(needsRest && !this.searchLoadFailed);
    if (!needsRest || this.searchLoadFailed || this.searchLoad) {
      return;
    }

    this.searchLoad = this.dataSyncService.ensureCompleteData()
      .catch((error: unknown) => {
        console.error('Failed to load every player for the search:', error);
        this.searchLoadFailed = true;
        this.isSearchingAllPlayers.set(false);
        this.loadError.set('We could not search every character right now. Please try again in a moment.');
      })
      .finally(() => {
        this.searchLoad = undefined;
      });
  }

  private bindTotalPlayerCount(): void {
    this.dataSyncService.getTotalPlayerCount().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((count) => {
      this.totalPlayerCount.set(count);
    });
  }

  private bindDatasetCompleteness(): void {
    this.dataSyncService.isDatasetComplete().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((isComplete) => {
      this.isDatasetComplete.set(isComplete);
      // The full set is published just before it is flagged complete, so the search that
      // asked for it last saw it as incomplete.
      if (isComplete) {
        this.isSearchingAllPlayers.set(false);
      }
    });
  }

  private bindSourcePlayers(): void {
    this.dataSyncService.getPlayers().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((players) => {
      this.sourcePlayerCount.set(players.length);
    });
  }

  private bindSyncProgress(): void {
    this.dataSyncService.getSyncProgress().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((progress) => {
      if (!this.hasStartedSync && !progress.isLoading && !this.hasSourcePlayers()) {
        return;
      }

      this.isLoading.set(progress.isLoading);
      this.syncMessage.set(progress.message);

      if (progress.isLoading) {
        this.loadError.set(undefined);
      }
    });
  }

  private bindFilteredPlayers(): void {
    combineLatest([
      this.filterState$.pipe(
        distinctUntilChanged(areLadderFilterStatesEqual),
        switchMap((state) =>
          this.getFilteredPlayers(state).pipe(
            map((players) => ({
              players,
              state
            }))
          )
        )
      ),
      this.rareAchievementIndicators$
    ]).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(([result, rareAchievementIndicators]) => {
      this.players.set(this.mapPlayersForView(result.players, result.state.search, rareAchievementIndicators));
      this.searchRestOfServerIfNeeded(result.state, result.players.length);
    });
  }

  private getFilteredPlayers(state: LadderFilterState) {
    return this.ladderService.getLadder(state.sort, {
      realm: state.realm,
      faction: state.faction,
      playerClass: state.playerClass,
      search: state.search,
      limit: state.pageSize
    });
  }

  private mapPlayersForView(
    players: Player[],
    search: string,
    rareAchievementIndicators: ReadonlyMap<string, RareAchievementSummary>
  ): LadderPlayerView[] {
    return mapLadderPlayersToView(players, search, rareAchievementIndicators);
  }

  private loadLastUpdated(): void {
    this.ladderLastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) {
        return;
      }

      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }
}
