import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { DEFAULT_LADDER_FILTER_STATE, areLadderFilterStatesEqual } from './ladder-filter-state';
import { mapLadderPlayersToView } from './ladder-player-view.mapper';
import { LadderAchievement, LadderService } from './ladder.service';
import { LadderFilterState, LadderPlayerView } from './ladder.types';
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

  constructor() {
    this.bindSourcePlayers();
    this.bindSyncProgress();
    this.bindFilteredPlayers();
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
  }

  async syncData(): Promise<void> {
    this.hasStartedSync = true;
    this.loadError.set(undefined);

    if (!this.hasSourcePlayers()) {
      this.isLoading.set(true);
      this.syncMessage.set('Loading ladder data...');
    }

    try {
      await this.dataSyncService.syncData();
      this.loadError.set(undefined);
    } catch (error) {
      console.error('Failed to sync data:', error);
      this.loadError.set('We could not load the ladder right now. Please try again in a moment.');
      this.isLoading.set(false);
      this.syncMessage.set('');
    }
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
              search: state.search
            }))
          )
        )
      ),
      this.rareAchievementIndicators$
    ]).pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(([result, rareAchievementIndicators]) => {
      this.players.set(this.mapPlayersForView(result.players, result.search, rareAchievementIndicators));
    });
  }

  private getFilteredPlayers(state: LadderFilterState) {
    const players$ = state.sort === 'achievementPoints'
      ? this.ladderService.getAchievements(
          state.realm,
          state.faction,
          state.playerClass,
          state.search,
          1,
          state.pageSize
        )
      : this.ladderService.getHonorableKills(
          state.realm,
          state.faction,
          state.playerClass,
          state.search,
          1,
          state.pageSize
        );

    return players$.pipe(
      map((players) => players)
    );
  }

  private mapPlayersForView(
    players: LadderAchievement[],
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
