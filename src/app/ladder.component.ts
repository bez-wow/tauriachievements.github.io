import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { FilterBarComponent } from './filter-bar.component';
import { LadderAchievement, LadderService } from './ladder.service';
import { HighlightPart, LadderFilterState, LadderPlayerView, LadderSort } from './ladder.types';
import { LeaderboardTableComponent } from './leaderboard-table.component';
import { DataSyncService } from './services/data-sync.service';
import { UpdateBarComponent } from './update-bar.component';

@Component({
  selector: 'app-achievement-ladder',
  templateUrl: './ladder.component.html',
  styleUrls: ['./ladder.component.scss'],
  standalone: true,
  imports: [CommonModule, HttpClientModule, UpdateBarComponent, FilterBarComponent, LeaderboardTableComponent]
})
export class AchievementLadderComponent implements OnInit {
  players: LadderPlayerView[] = [];
  currentSort: LadderSort = 'achievementPoints';
  currentRealm?: string = undefined;
  currentFaction?: string;
  currentClass?: number;
  pageSize = 100;
  searchTerm = '';
  isLoading = true;
  syncMessage = 'Loading ladder data...';
  loadError?: string;
  lastEdited?: Date;
  lastEditedTimeZoneLabel = 'Local time';
  showBackToTop = false;
  readonly pageSizeOptions = [100, 500, 1000];
  sortOptions: Array<{ value: LadderSort; label: string }> = [
    { value: 'achievementPoints', label: 'Achievements' },
    { value: 'honorableKills', label: 'Honorable Kills' }
  ];

  realmOptions = [
    { value: undefined, label: 'All Realms' },
    { value: 'Evermoon', label: 'Evermoon' },
    { value: 'Tauri', label: 'Tauri' },
    { value: 'WoD', label: 'WoD' }
  ];

  factionOptions = [
    { value: undefined, label: 'All Factions' },
    { value: 'Horde', label: 'Horde' },
    { value: 'Alliance', label: 'Alliance' }
  ];

  classOptions = [
    { id: 6, name: 'Death Knight', icon: getClassIconPath(6) },
    { id: 12, name: 'Demon Hunter', icon: getClassIconPath(12) },
    { id: 11, name: 'Druid', icon: getClassIconPath(11) },
    { id: 3, name: 'Hunter', icon: getClassIconPath(3) },
    { id: 8, name: 'Mage', icon: getClassIconPath(8) },
    { id: 10, name: 'Monk', icon: getClassIconPath(10) },
    { id: 2, name: 'Paladin', icon: getClassIconPath(2) },
    { id: 5, name: 'Priest', icon: getClassIconPath(5) },
    { id: 4, name: 'Rogue', icon: getClassIconPath(4) },
    { id: 7, name: 'Shaman', icon: getClassIconPath(7) },
    { id: 9, name: 'Warlock', icon: getClassIconPath(9) },
    { id: 1, name: 'Warrior', icon: getClassIconPath(1) }
  ];

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput$ = new Subject<string>();
  private hasStartedSync = false;

  constructor(
    private ladderService: LadderService,
    private dataSyncService: DataSyncService,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) {
    this.isLoading = this.dataSyncService.getCurrentPlayers().length === 0;
    this.syncMessage = this.isLoading ? 'Loading ladder data...' : '';
  }

  ngOnInit() {
    this.dataSyncService.getSyncProgress().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(progress => {
      if (!this.hasStartedSync && !progress.isLoading && !this.hasSourcePlayers) {
        return;
      }

      this.isLoading = progress.isLoading;
      this.syncMessage = progress.message;

      if (progress.isLoading) {
        this.loadError = undefined;
      }

      this.cdr.markForCheck();
    });

    this.searchInput$.pipe(
      map(value => value.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      this.syncFiltersToQueryParams(true);
    });

    this.route.queryParamMap.pipe(
      map(params => this.parseFilterState(params)),
      distinctUntilChanged((previous, current) => this.areFilterStatesEqual(previous, current)),
      tap(state => this.applyFilterState(state)),
      switchMap(state => this.getFilteredPlayers(state)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(data => {
      this.updatePlayers(data);
    });

    this.syncData();
    this.loadLastUpdated();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    this.showBackToTop = scrollTop > 400;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async syncData() {
    this.hasStartedSync = true;
    this.loadError = undefined;

    if (!this.hasSourcePlayers) {
      this.isLoading = true;
      this.syncMessage = 'Loading ladder data...';
    }

    try {
      await this.dataSyncService.syncData();
      this.loadError = undefined;
    } catch (error) {
      console.error('Failed to sync data:', error);
      this.loadError = 'We could not load the ladder right now. Please try again in a moment.';
      this.isLoading = false;
      this.syncMessage = '';
    } finally {
      this.cdr.markForCheck();
    }
  }

  setSort(sort: LadderSort) {
    this.currentSort = sort;
    this.syncFiltersToQueryParams();
  }

  setRealm(realm: string | undefined) {
    this.currentRealm = realm;
    this.syncFiltersToQueryParams();
  }

  setFaction(faction: string | undefined) {
    this.currentFaction = faction;
    this.syncFiltersToQueryParams();
  }

  setClass(playerClass: number | undefined) {
    this.currentClass = playerClass;
    this.syncFiltersToQueryParams();
  }

  setPageSize(size: number) {
    this.pageSize = size;
    this.syncFiltersToQueryParams();
  }

  onSearchChange(search: string) {
    this.searchTerm = search;
    this.searchInput$.next(search);
  }

  resetFilters() {
    this.currentSort = 'achievementPoints';
    this.currentRealm = undefined;
    this.currentFaction = undefined;
    this.currentClass = undefined;
    this.pageSize = 100;
    this.searchTerm = '';
    this.syncFiltersToQueryParams();
  }

  private parseFilterState(params: ParamMap): LadderFilterState {
    const sortParam = params.get('sort');
    const realmParam = params.get('realm');
    const factionParam = params.get('faction');
    const classParam = params.get('class');
    const pageSizeParam = Number(params.get('pageSize'));

    const sort = this.sortOptions.some(option => option.value === sortParam)
      ? (sortParam as LadderSort)
      : 'achievementPoints';

    const realm = this.realmOptions.some(option => option.value === realmParam)
      ? realmParam ?? undefined
      : undefined;

    const faction = this.factionOptions.some(option => option.value === factionParam)
      ? factionParam ?? undefined
      : undefined;

    const parsedClass = classParam ? Number(classParam) : undefined;
    const playerClass = Number.isFinite(parsedClass) && this.classOptions.some(option => option.id === parsedClass)
      ? parsedClass
      : undefined;

    const pageSize = this.pageSizeOptions.includes(pageSizeParam)
      ? pageSizeParam
      : 100;

    return {
      sort,
      realm,
      faction,
      playerClass,
      pageSize,
      search: params.get('search') ?? ''
    };
  }

  private applyFilterState(state: LadderFilterState) {
    this.currentSort = state.sort;
    this.currentRealm = state.realm;
    this.currentFaction = state.faction;
    this.currentClass = state.playerClass;
    this.pageSize = state.pageSize;
    this.searchTerm = state.search;
    this.cdr.markForCheck();
  }

  private areFilterStatesEqual(previous: LadderFilterState, current: LadderFilterState): boolean {
    return previous.sort === current.sort
      && previous.realm === current.realm
      && previous.faction === current.faction
      && previous.playerClass === current.playerClass
      && previous.pageSize === current.pageSize
      && previous.search === current.search;
  }

  private getFilteredPlayers(state: LadderFilterState) {
    return state.sort === 'achievementPoints'
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
  }

  private syncFiltersToQueryParams(replaceUrl: boolean = false) {
    const normalizedSearch = this.searchTerm.trim();

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        sort: this.currentSort === 'achievementPoints' ? null : this.currentSort,
        realm: this.currentRealm ?? null,
        faction: this.currentFaction ?? null,
        class: this.currentClass ?? null,
        pageSize: this.pageSize === 100 ? null : this.pageSize,
        search: normalizedSearch || null
      },
      replaceUrl
    });
  }

  private updatePlayers(data: LadderAchievement[]) {
    const searchQuery = this.searchTerm.trim();

    this.players = data.map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      realm: item.realm,
      race: item.race,
      gender: item.gender,
      raceIcon: getRaceIconPath(item.race, item.gender),
      classIcon: item.class.toString(),
      guild: item.guild,
      achievementPoints: item.achievementPoints,
      honorableKills: item.honorableKills,
      faction: item.faction,
      nameParts: this.buildHighlightParts(item.name, searchQuery),
      guildParts: this.buildHighlightParts(item.guild, searchQuery)
    }));
    this.cdr.markForCheck();
  }

  private loadLastUpdated() {
    const cacheBustedUrl = `lastUpdated.txt?v=${Date.now()}`;
    this.http.get(cacheBustedUrl, { responseType: 'text' }).subscribe({
      next: (value) => {
        const parsed = new Date(value.trim());
        if (isNaN(parsed.getTime())) {
          console.warn('Invalid lastUpdated.txt date:', value);
          return;
        }
        this.lastEdited = parsed;
        this.lastEditedTimeZoneLabel = this.getTimeZoneLabel(parsed);
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load lastUpdated.txt:', error);
      }
    });
  }

  private getTimeZoneLabel(date: Date): string {
    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
      return parts.find(part => part.type === 'timeZoneName')?.value ?? 'Local time';
    } catch {
      return 'Local time';
    }
  }

  private buildHighlightParts(value: string, query: string): HighlightPart[] {
    if (!value) {
      return [];
    }

    if (!query) {
      return [{ text: value, isMatch: false }];
    }

    const normalizedValue = value.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    const parts: HighlightPart[] = [];
    let cursor = 0;

    while (cursor < value.length) {
      const matchIndex = normalizedValue.indexOf(normalizedQuery, cursor);
      if (matchIndex === -1) {
        parts.push({ text: value.slice(cursor), isMatch: false });
        break;
      }

      if (matchIndex > cursor) {
        parts.push({ text: value.slice(cursor, matchIndex), isMatch: false });
      }

      parts.push({
        text: value.slice(matchIndex, matchIndex + query.length),
        isMatch: true
      });

      cursor = matchIndex + query.length;
    }

    return parts;
  }

  get hasSourcePlayers(): boolean {
    return this.dataSyncService.getCurrentPlayers().length > 0;
  }

  get showLoadingState(): boolean {
    return this.isLoading && !this.hasSourcePlayers;
  }

  get showErrorState(): boolean {
    return !this.isLoading && !!this.loadError && !this.hasSourcePlayers;
  }

  get showEmptyState(): boolean {
    return !this.showLoadingState && !this.showErrorState && this.players.length === 0;
  }

  get showRefreshingBanner(): boolean {
    return this.isLoading && this.hasSourcePlayers;
  }

  get showErrorBanner(): boolean {
    return !!this.loadError && this.hasSourcePlayers;
  }

  get hasSearchQuery(): boolean {
    return this.searchTerm.trim().length > 0;
  }

  get hasActiveFilters(): boolean {
    return !!this.currentRealm
      || !!this.currentFaction
      || this.currentClass !== undefined;
  }

  get emptyStateTitle(): string {
    return this.hasSearchQuery ? 'No matches found' : 'No players found';
  }

  get emptyStateMessage(): string {
    if (this.hasSearchQuery && this.hasActiveFilters) {
      return 'No players or guilds match your search with the current filters.';
    }

    if (this.hasSearchQuery) {
      return 'No players or guilds match your search.';
    }

    if (this.hasActiveFilters) {
      return 'No players match the current filters. Try broadening them or resetting the filters.';
    }

    return 'No ladder data is available right now.';
  }

  get emptyStateHint(): string {
    if (this.hasSearchQuery && this.hasActiveFilters) {
      return 'Try a different name, guild, or reset the filters.';
    }

    if (this.hasSearchQuery) {
      return 'Try a different character name or guild.';
    }

    return '';
  }

  get hasNarrowingFilters(): boolean {
    return this.hasActiveFilters || this.hasSearchQuery;
  }
}
