import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { injectCompactViewport } from '../../shared/compact-viewport';
import {
  MythicPlusAffix,
  ROLE_LABELS,
  characterKey,
  currentAffixWeek,
  exportedAt,
  hasScanChanges,
  memberNameMatches,
  pageCount,
  PlayerScore,
  playerRanks,
  rankPlayers,
  runScoreColor,
  scoreColor,
  scoreTiers,
  seasonScoreColors
} from './mythic-plus';
import { MythicPlusPlayersListComponent } from './mythic-plus-players-list.component';
import { COMPARE_LIMIT, compareParam, parseCompareParam } from './mythic-plus-compare';
import { characterParam, findCharacters, parseCharacterParam } from './mythic-plus-profile';
import { MythicPlusRunsListComponent } from './mythic-plus-runs-list.component';
import { MythicPlusSpecChartComponent } from './mythic-plus-spec-chart.component';
import {
  MYTHIC_PLUS_CARDS_PAGE_SIZE,
  MYTHIC_PLUS_CARDS_QUERY,
  MYTHIC_PLUS_PAGE_SIZE,
  PlayerRow,
  RunRow,
  bestRunCells,
  toMemberView,
  toRunView
} from './mythic-plus-views';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { MobileFilterToggleComponent } from '../../shared/mobile-filter-toggle.component';
import { MythicPlusPageStore } from './mythic-plus-page.store';
import {
  LeaderboardPeriod,
  LeaderboardView,
  PlayerStandingChange,
  RankedRun,
  RunOrder,
  emptyLeaderboardMessage,
  filterRuns,
  memberFilter,
  realmFilterOptions,
  runsInScope,
  scanStandingChanges
} from './mythic-plus-leaderboard';
import { getClassColor } from '../../game/class-colors';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { characterTransitionName } from '../../shared/motion/motion';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES, parseClassId, parseRole, Role } from '../../game/wow';
import { LEGION_SPECS, parseSpecName } from '../../game/wow-specs';
import { injectReplaceUrl, parsePage } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { formatClock } from '../../shared/time-format';
import { mythicPlusProfileLink } from '../../core/page-links';

interface RankedPlayer {
  player: PlayerScore;
  rank: number;
}

interface CharacterFilter {
  key: string;
  name: string;
  realm: string;
  color: string;
  profileLink: string[];
}

@Component({
  selector: 'app-mythic-plus-page',
  imports: [
    RouterLink,
    MythicPlusSpecChartComponent,
    MythicPlusWeekAffixesComponent,
    MythicPlusRunsListComponent,
    MythicPlusPlayersListComponent,
    FilterDropdownComponent,
    MobileFilterToggleComponent,
    GlideDirective,
    DecimalPipe,
    NgTemplateOutlet,
    LoadStateComponent
  ],
  templateUrl: './mythic-plus-page.component.html',
  styleUrls: ['./mythic-plus-page.component.scss'],
  providers: [FilterDropdownCoordinatorService, MythicPlusPageStore],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPageComponent implements OnInit {
  private readonly store = inject(MythicPlusPageStore);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  private readonly leaderboardRef = viewChild<ElementRef<HTMLElement>>('leaderboard');

  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);
  readonly filtersOpen = signal(false);

  readonly index = this.store.index;
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly runsByDungeon = this.store.runsByDungeon;
  readonly isLoading = this.store.isLoading;
  readonly loadError = this.store.loadError;
  readonly dungeons = this.store.dungeons;
  readonly selectedDungeon = this.store.selectedDungeon;
  readonly page = signal(parsePage(this.route.snapshot.queryParamMap.get('page')));
  readonly search = signal('');
  private readonly characterParam = signal(parseCharacterParam(this.route.snapshot.queryParamMap.get('character')));
  readonly expandedRunId = linkedSignal<number, string | undefined>({
    source: this.store.restarts,
    computation: () => undefined
  });
  readonly view = signal<LeaderboardView>(
    this.route.snapshot.queryParamMap.get('view') === 'players' ? 'players' : 'runs');
  readonly runOrder = signal<RunOrder>(this.route.snapshot.queryParamMap.get('sort') === 'latest' ? 'latest' : 'best');
  readonly realmFilter = signal<string | undefined>(this.route.snapshot.queryParamMap.get('realm')?.toLowerCase() || undefined);
  readonly classFilter = signal<number | undefined>(parseClassId(this.route.snapshot.queryParamMap.get('class')));
  readonly specFilter = signal<string | undefined>(
    parseSpecName(this.classFilter(), this.route.snapshot.queryParamMap.get('spec')));
  readonly roleFilter = signal<Role | undefined>(
    this.view() === 'players' ? parseRole(this.route.snapshot.queryParamMap.get('role')) : undefined);
  readonly roles: readonly Role[] = ['tank', 'healer', 'dps'];
  readonly roleLabels = ROLE_LABELS;
  readonly period = signal<LeaderboardPeriod>(
    this.route.snapshot.queryParamMap.get('period') === 'week' ? 'week' : 'season');

  readonly classOptions = CLASS_FILTER_OPTIONS;

  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const classId = this.classFilter();
    return [
      { value: undefined, label: 'All specs' },
      ...LEGION_SPECS
        .filter(spec => spec.classId === classId)
        .map(spec => ({ value: spec.spec, label: spec.spec, icon: spec.icon }))
    ];
  });

  readonly realmOptions = computed(() => realmFilterOptions(this.index()?.players ?? []));

  private readonly realmName = computed(() => {
    const realm = this.realmFilter();
    return realm && (this.realmOptions().find(option => option.value === realm)?.label ?? realm);
  });

  readonly activeFilterLabels = computed(() => {
    const classId = this.classFilter();
    return [
      this.realmName(),
      classId === undefined ? undefined : CLASS_NAMES[classId],
      classId === undefined ? undefined : this.specFilter()
    ].filter((label): label is string => !!label);
  });

  private readonly indexCharacters = computed(() =>
    (this.index()?.players ?? []).map(([name, realm, , classId]) => ({ name, realm, classId })));

  readonly characterFilter = computed<CharacterFilter | undefined>(() => {
    const wanted = this.characterParam();
    if (!wanted) {
      return undefined;
    }

    const found = findCharacters(this.indexCharacters(), wanted.realm, wanted.name)[0];
    const character = found ?? wanted;
    return {
      key: characterKey(character),
      name: character.name,
      realm: character.realm,
      color: (found && getClassColor(found.classId)) ?? '#e0e0e0',
      profileLink: mythicPlusProfileLink(character)
    };
  });

  readonly selectedDungeonTimer = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? formatClock(dungeon.timerSeconds) : undefined;
  });

  private readonly dungeonsById = computed(() =>
    new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly affixesById = computed(() =>
    new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  readonly affixWeek = computed(() => currentAffixWeek([...this.runsByDungeon().values()].flat()));
  readonly weekAffixes = computed(() => {
    const affixes = this.affixesById();
    return (this.affixWeek()?.affixes ?? [])
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined);
  });

  private readonly scoreColors = computed(() => seasonScoreColors(this.index()));

  readonly scopeRuns = computed(() => runsInScope(
    this.runsByDungeon(),
    this.dungeons(),
    this.selectedDungeon(),
    this.period() === 'week' ? this.affixWeek()?.since : undefined));

  readonly runsLoading = computed(() => !this.isLoading() && !this.loadError() && this.scopeRuns() === undefined);

  readonly dungeonRuns = computed(() => this.scopeRuns() ?? []);

  private readonly rankedRuns = computed<RankedRun[]>(() =>
    this.dungeonRuns().map((run, index) => ({ run, rank: index + 1 })));

  readonly filteredRows = computed(() =>
    filterRuns(this.rankedRuns(), this.characterFilter()?.key, this.search(), this.runOrder()));

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  setRunOrder(order: RunOrder): void {
    if (order === this.runOrder()) {
      return;
    }
    this.runOrder.set(order);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  private readonly rankedPlayers = computed<RankedPlayer[]>(() => {
    const include = memberFilter({
      realm: this.realmFilter(),
      classId: this.classFilter(),
      spec: this.specFilter(),
      role: this.roleFilter()
    });
    const ranking = rankPlayers(this.dungeonRuns(), include);
    const ranks = playerRanks(ranking);
    return ranking.map((player, index) => ({ player, rank: ranks[index] }));
  });

  readonly filteredPlayers = computed<RankedPlayer[]>(() => {
    const query = this.search();
    const ranked = this.rankedPlayers();
    return query.trim() ? ranked.filter(entry => memberNameMatches(entry.player.member, query)) : ranked;
  });

  private readonly showStandingChanges = computed(() =>
    hasScanChanges(this.index())
      && this.period() === 'season'
      && !this.selectedDungeon()
      && this.realmFilter() === undefined
      && this.classFilter() === undefined
      && this.specFilter() === undefined
      && this.roleFilter() === undefined);

  private readonly standingChanges = computed<ReadonlyMap<string, PlayerStandingChange>>(() =>
    scanStandingChanges(this.index()));

  readonly resultCount = computed(() =>
    this.view() === 'players' ? this.filteredPlayers().length : this.filteredRows().length);
  readonly resultUnit = computed(() => {
    const single = this.resultCount() === 1;
    return this.view() === 'players' ? (single ? 'player' : 'players') : (single ? 'run' : 'runs');
  });

  readonly totalPages = computed(() => pageCount(this.resultCount(), this.pageSize()));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  private readonly playerColor = computed(() => {
    const colors = this.scoreColors();
    if (this.selectedDungeon()) {
      return (score: number) => runScoreColor(score, colors);
    }

    const tiers = this.period() === 'week'
      ? scoreTiers(this.rankedPlayers().map(entry => entry.player.score))
      : colors.tiers;
    return (score: number) => scoreColor(score, tiers);
  });

  readonly pagedRows = computed<RunRow[]>(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    const dungeons = this.dungeonsById();
    const affixes = this.affixesById();
    const colors = this.scoreColors();

    return this.filteredRows().slice(start, start + size).flatMap(({ run, rank }) => {
      const dungeon = dungeons.get(run.dungeon);
      return dungeon ? [{ ...toRunView(run, dungeon, affixes, colors), rank }] : [];
    });
  });

  readonly playerDungeons = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? [dungeon] : this.dungeons();
  });

  readonly pagedPlayers = computed<PlayerRow[]>(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    const dungeons = this.playerDungeons();
    const showChanges = this.showStandingChanges();
    const changes = this.standingChanges();

    const playerColor = this.playerColor();
    return this.filteredPlayers().slice(start, start + size).map(({ player, rank }) => {
      const change = showChanges ? changes.get(player.key) : undefined;
      return {
        key: player.key,
        rank,
        member: toMemberView({ ...player.member, spec: player.primarySpec }),
        score: player.score,
        color: playerColor(player.score),
        change,
        newSinceLastScan: showChanges && !change,
        bests: bestRunCells(player.bestRuns, dungeons)
      };
    });
  });

  readonly characterSummary = computed(() => {
    const character = this.characterFilter();
    if (!character || this.view() !== 'runs') {
      return undefined;
    }

    const count = this.filteredRows().length;
    const dungeon = this.selectedDungeon();
    return {
      character,
      count,
      unit: count === 1 ? 'Mythic+ run' : 'Mythic+ runs',
      scope: [dungeon && `in ${dungeon.name}`, this.period() === 'week' ? 'this week' : 'this season']
        .filter(Boolean).join(' ')
    };
  });

  readonly emptyMessage = computed(() => emptyLeaderboardMessage({
    view: this.view(),
    period: this.period(),
    query: this.search(),
    dungeon: this.selectedDungeon(),
    character: this.characterFilter(),
    classId: this.classFilter(),
    spec: this.specFilter(),
    realmName: this.realmName(),
    role: this.roleFilter()
  }));

  ngOnInit(): void {
    this.store.load(this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  }

  readonly compareLimit = COMPARE_LIMIT;
  readonly compareMode = signal(this.route.snapshot.queryParamMap.has('compare'));
  private readonly comparePicks = signal(parseCompareParam(this.route.snapshot.queryParamMap.get('compare')));
  private viewBeforeCompare: LeaderboardView = 'runs';
  readonly picked = computed(() => {
    const characters = this.indexCharacters();
    return this.comparePicks().map(pick => {
      const found = findCharacters(characters, pick.realm, pick.name)[0];
      const character = found ?? pick;
      const key = characterKey(character);
      return {
        key,
        name: character.name,
        realm: character.realm,
        color: (found && getClassColor(found.classId)) ?? '#e0e0e0',
        nameTransition: characterTransitionName(key, 'name')
      };
    });
  });
  readonly pickedKeys = computed(() => new Set(this.picked().map(pick => pick.key)));
  readonly compareParams = computed(() => ({ players: compareParam(this.picked()) }));

  toggleCompareMode(): void {
    this.compareMode.update(on => !on);
    if (this.compareMode()) {
      this.viewBeforeCompare = this.view();
      this.setView('players');
    }
    this.syncQueryParams();
  }

  togglePick(row: PlayerRow): void {
    if (this.pickedKeys().has(row.key)) {
      this.removePick(row.key);
      return;
    }
    this.comparePicks.update(picks =>
      picks.length < COMPARE_LIMIT ? [...picks, { name: row.member.name, realm: row.member.realm }] : picks);
    this.syncQueryParams();
  }

  removePick(key: string): void {
    const characters = this.indexCharacters();
    this.comparePicks.update(picks => picks.filter(pick =>
      characterKey(findCharacters(characters, pick.realm, pick.name)[0] ?? pick) !== key));
    this.syncQueryParams();
  }

  cancelCompare(): void {
    this.comparePicks.set([]);
    this.compareMode.set(false);
    this.setView(this.viewBeforeCompare);
    this.syncQueryParams();
  }

  retryLoad(): void {
    this.store.retry();
  }

  setRealmFilter(value: FilterDropdownValue): void {
    const realm = typeof value === 'string' ? value : undefined;
    if (realm === this.realmFilter()) {
      return;
    }

    this.realmFilter.set(realm);
    this.page.set(1);
    this.syncQueryParams();
  }

  resetFilters(): void {
    this.realmFilter.set(undefined);
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.page.set(1);
    this.syncQueryParams();
  }

  setClassFilter(value: FilterDropdownValue): void {
    const classId = typeof value === 'number' ? value : undefined;
    if (classId === this.classFilter()) {
      return;
    }

    this.classFilter.set(classId);
    this.specFilter.set(undefined);
    this.page.set(1);
    this.syncQueryParams();
  }

  setSpecFilter(value: FilterDropdownValue): void {
    const spec = typeof value === 'string' ? value : undefined;
    if (spec === this.specFilter()) {
      return;
    }

    this.specFilter.set(spec);
    this.page.set(1);
    this.syncQueryParams();
  }

  showSpecPlayers(selection: { classId: number; spec: string }): void {
    this.view.set('players');
    this.roleFilter.set(undefined);
    this.classFilter.set(selection.classId);
    this.specFilter.set(selection.spec);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  setPeriod(period: LeaderboardPeriod): void {
    if (period === this.period()) {
      return;
    }

    this.period.set(period);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  setView(view: LeaderboardView): void {
    if (view === this.view() && !(view === 'players' && this.roleFilter())) {
      return;
    }

    this.view.set(view);
    this.roleFilter.set(undefined);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  showRoles(): void {
    if (this.view() === 'players' && this.roleFilter()) {
      return;
    }

    this.view.set('players');
    this.roleFilter.set('tank');
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  setRole(role: Role): void {
    if (role === this.roleFilter()) {
      return;
    }

    this.roleFilter.set(role);
    this.page.set(1);
    this.syncQueryParams();
  }

  selectDungeon(dungeonId: string | undefined): void {
    this.store.selectedDungeonId.set(dungeonId);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
    this.store.loadScopeRuns();
  }

  goToPage(page: number, scrollToLeaderboard = false): void {
    const nextPage = Math.min(Math.max(1, page), this.totalPages());
    if (nextPage === this.currentPage()) {
      return;
    }

    this.page.set(nextPage);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();

    if (scrollToLeaderboard) {
      this.leaderboardRef()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  clearCharacterFilter(): void {
    this.characterParam.set(undefined);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);

    if (this.characterParam() || this.page() !== 1) {
      this.characterParam.set(undefined);
      this.page.set(1);
      this.syncQueryParams();
    }
  }

  toggleRun(runId: string): void {
    this.expandedRunId.update(current => current === runId ? undefined : runId);
  }

  private syncQueryParams(): void {
    const players = this.view() === 'players';
    const character = this.characterFilter();
    this.replaceUrl({
      dungeon: this.selectedDungeon()?.id ?? null,
      period: this.period() === 'week' ? 'week' : null,
      view: players ? 'players' : null,
      sort: !players && this.runOrder() === 'latest' ? 'latest' : null,
      realm: players ? this.realmFilter() ?? null : null,
      class: players ? this.classFilter() ?? null : null,
      spec: players ? this.specFilter() ?? null : null,
      role: players ? this.roleFilter() ?? null : null,
      character: character ? characterParam(character) : null,
      page: this.currentPage() > 1 ? this.currentPage() : null,
      compare: this.compareMode() ? compareParam(this.picked()) || null : null
    });
  }
}
