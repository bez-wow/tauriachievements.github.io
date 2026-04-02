import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { FilterBarComponent } from './filter-bar.component';
import {
  CLASS_OPTIONS,
  FACTION_OPTIONS,
  PAGE_SIZE_OPTIONS,
  REALM_OPTIONS,
  SORT_OPTIONS
} from './ladder-options';
import {
  DEFAULT_LADDER_FILTER_STATE,
  areLadderFilterStatesEqual,
  parseLadderFilterState,
  toLadderQueryParams
} from './ladder-filter-state';
import { LadderPageStore } from './ladder-page.store';
import { LeaderboardTableComponent } from './leaderboard-table.component';
import { LadderFilterState, LadderSort } from './ladder.types';
import { UpdateBarComponent } from './update-bar.component';

@Component({
  selector: 'app-achievement-ladder',
  templateUrl: './ladder.component.html',
  styleUrls: ['./ladder.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, FilterBarComponent, LeaderboardTableComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [LadderPageStore]
})
export class AchievementLadderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ladderPageStore = inject(LadderPageStore);
  private readonly searchInput$ = new Subject<string>();

  readonly sortOptions = SORT_OPTIONS;
  readonly realmOptions = REALM_OPTIONS;
  readonly factionOptions = FACTION_OPTIONS;
  readonly classOptions = CLASS_OPTIONS;
  readonly pageSizeOptions = [...PAGE_SIZE_OPTIONS];
  readonly filterState = signal<LadderFilterState>(DEFAULT_LADDER_FILTER_STATE);
  readonly currentSort = computed(() => this.filterState().sort);
  readonly currentRealm = computed(() => this.filterState().realm);
  readonly currentFaction = computed(() => this.filterState().faction);
  readonly currentClass = computed(() => this.filterState().playerClass);
  readonly pageSize = computed(() => this.filterState().pageSize);
  readonly searchTerm = computed(() => this.filterState().search);
  readonly players = this.ladderPageStore.players;
  readonly isLoading = this.ladderPageStore.isLoading;
  readonly syncMessage = this.ladderPageStore.syncMessage;
  readonly loadError = this.ladderPageStore.loadError;
  readonly lastEdited = this.ladderPageStore.lastEdited;
  readonly lastEditedTimeZoneLabel = this.ladderPageStore.lastEditedTimeZoneLabel;
  readonly hasSourcePlayers = this.ladderPageStore.hasSourcePlayers;
  readonly showLoadingState = computed(() => this.isLoading() && !this.hasSourcePlayers());
  readonly showErrorState = computed(() => !this.isLoading() && !!this.loadError() && !this.hasSourcePlayers());
  readonly showEmptyState = computed(() => !this.showLoadingState() && !this.showErrorState() && this.players().length === 0);
  readonly showRefreshingBanner = computed(() => this.isLoading() && this.hasSourcePlayers());
  readonly showErrorBanner = computed(() => !!this.loadError() && this.hasSourcePlayers());
  readonly hasSearchQuery = computed(() => this.searchTerm().trim().length > 0);
  readonly hasActiveFilters = computed(() => !!this.currentRealm() || !!this.currentFaction() || this.currentClass() !== undefined);
  readonly emptyStateTitle = computed(() => this.hasSearchQuery() ? 'No matches found' : 'No players found');
  readonly emptyStateMessage = computed(() => {
    if (this.hasSearchQuery() && this.hasActiveFilters()) {
      return 'No players or guilds match your search with the current filters.';
    }

    if (this.hasSearchQuery()) {
      return 'No players or guilds match your search.';
    }

    if (this.hasActiveFilters()) {
      return 'No players match the current filters. Try broadening them or resetting the filters.';
    }

    return 'No ladder data is available right now.';
  });
  readonly emptyStateHint = computed(() => {
    if (this.hasSearchQuery() && this.hasActiveFilters()) {
      return 'Try a different name, guild, or reset the filters.';
    }

    if (this.hasSearchQuery()) {
      return 'Try a different character name or guild.';
    }

    return '';
  });
  readonly hasNarrowingFilters = computed(() => this.hasActiveFilters() || this.hasSearchQuery());

  ngOnInit(): void {
    const initialFilterState = parseLadderFilterState(this.route.snapshot.queryParamMap);
    this.applyFilterState(initialFilterState);

    this.searchInput$.pipe(
      map((value) => value.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      const nextState = {
        ...this.filterState(),
        search: this.filterState().search.trim()
      };

      this.applyFilterState(nextState);
      this.navigateToFilterState(nextState, true);
    });

    this.route.queryParamMap.pipe(
      map((params) => parseLadderFilterState(params)),
      distinctUntilChanged(areLadderFilterStatesEqual),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((state) => {
      this.applyFilterState(state);
    });

    this.ladderPageStore.initialize();
  }

  syncData(): void {
    void this.ladderPageStore.syncData();
  }

  setSort(sort: LadderSort): void {
    this.updateFilterState({ sort });
  }

  setRealm(realm: string | undefined): void {
    this.updateFilterState({ realm });
  }

  setFaction(faction: string | undefined): void {
    this.updateFilterState({ faction });
  }

  setClass(playerClass: number | undefined): void {
    this.updateFilterState({ playerClass });
  }

  setPageSize(pageSize: number): void {
    this.updateFilterState({ pageSize });
  }

  onSearchChange(search: string): void {
    this.filterState.update((state) => ({
      ...state,
      search
    }));
    this.searchInput$.next(search);
  }

  resetFilters(): void {
    this.updateFilterState(DEFAULT_LADDER_FILTER_STATE);
  }

  private updateFilterState(patch: Partial<LadderFilterState>, replaceUrl: boolean = false): void {
    const nextState = {
      ...this.filterState(),
      ...patch
    };

    this.applyFilterState(nextState);
    this.navigateToFilterState(nextState, replaceUrl);
  }

  private applyFilterState(state: LadderFilterState): void {
    this.filterState.set(state);
    this.ladderPageStore.setFilterState(state);
  }

  private navigateToFilterState(state: LadderFilterState, replaceUrl: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toLadderQueryParams(state),
      replaceUrl
    });
  }
}
