import { CommonModule, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getClassIconPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { injectCompactViewport } from './compact-viewport';
import {
  CLASS_NAMES,
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusRun,
  NEWER_DATA_MESSAGE,
  characterKey,
  createRunDecoder,
  currentAffixWeek,
  exportedAt,
  formatClock,
  formatDuration,
  keystoneUpgrades,
  memberNameMatches,
  pageCount,
  PlayerScore,
  rankPlayers,
  rankRuns,
  runIncludesCharacter,
  runIncludesPlayer,
  scoreQuality,
  sharesTables
} from './mythic-plus';
import { MythicPlusPlayersListComponent } from './mythic-plus-players-list.component';
import { characterParam, characterProfileLink, findCharacters, parseCharacterParam, realmSlug } from './mythic-plus-profile';
import { MythicPlusRunsListComponent } from './mythic-plus-runs-list.component';
import { MythicPlusSpecChartComponent } from './mythic-plus-spec-chart.component';
import { LEGION_SPECS } from './mythic-plus-stats';
import {
  MYTHIC_PLUS_CARDS_PAGE_SIZE,
  MYTHIC_PLUS_CARDS_QUERY,
  MYTHIC_PLUS_PAGE_SIZE,
  PlayerRow,
  RunRow,
  toMemberView,
  toRunView
} from './mythic-plus-views';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { MobileFilterToggleComponent } from './mobile-filter-toggle.component';
import { UpdateBarComponent } from './update-bar.component';
import { DataFileService } from './services/data-file.service';
import { getClassColor } from './class-colors';

interface RankedRun {
  run: MythicPlusRun;
  rank: number;
}

type LeaderboardView = 'runs' | 'players';

/** Season: every run. Week: only runs with the current week's affixes. */
type LeaderboardPeriod = 'season' | 'week';

interface RankedPlayer {
  player: PlayerScore;
  rank: number;
}

/**
 * One character, from `?character=Name-Realm` (a profile's "Show runs" or rank links). The runs
 * view shows only their runs; the players view picks out their row.
 */
interface CharacterFilter {
  /** `characterKey` of the character. */
  key: string;
  name: string;
  realm: string;
  color: string;
  profileLink: string[];
}

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseClassFilter(value: string | null): number | undefined {
  const classId = Number(value);
  return value && CLASS_NAMES[classId] ? classId : undefined;
}

/** A spec from the URL only counts when it belongs to the class filter. */
function parseSpecFilter(classId: number | undefined, value: string | null): string | undefined {
  return LEGION_SPECS.find(spec => spec.classId === classId && spec.spec === value)?.spec;
}

@Component({
  selector: 'app-mythic-plus-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    MythicPlusSpecChartComponent,
    MythicPlusWeekAffixesComponent,
    MythicPlusRunsListComponent,
    MythicPlusPlayersListComponent,
    FilterDropdownComponent,
    MobileFilterToggleComponent
  ],
  templateUrl: './mythic-plus-page.component.html',
  styleUrls: ['./mythic-plus-page.component.scss'],
  // Keeps one of this page's dropdowns open at a time.
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  @ViewChild('leaderboard') private leaderboardRef?: ElementRef<HTMLElement>;

  /** Narrow screens list runs and players as cards (MYTHIC_PLUS_CARDS_QUERY). */
  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  private readonly pageSize = computed(() => this.cards() ? MYTHIC_PLUS_CARDS_PAGE_SIZE : MYTHIC_PLUS_PAGE_SIZE);
  /** Phones: whether the realm / class / spec filters are shown, or folded behind the Filters button. */
  readonly filtersOpen = signal(false);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));
  /** Decoded runs per dungeon id, filled as the dungeon files arrive. */
  readonly runsByDungeon = signal<ReadonlyMap<string, readonly MythicPlusRun[]>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDungeonId = signal<string | undefined>(
    this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  readonly page = signal(parsePage(this.route.snapshot.queryParamMap.get('page')));
  readonly search = signal('');
  /** The character `?character=` names, as written there; typing a search replaces it. */
  private readonly characterParam = signal(parseCharacterParam(this.route.snapshot.queryParamMap.get('character')));
  readonly expandedRunId = signal<string | undefined>(undefined);
  readonly view = signal<LeaderboardView>(
    this.route.snapshot.queryParamMap.get('view') === 'players' ? 'players' : 'runs');
  /** Players view only: one realm (its slug), one class, and optionally one of its specs. */
  readonly realmFilter = signal<string | undefined>(this.route.snapshot.queryParamMap.get('realm')?.toLowerCase() || undefined);
  readonly classFilter = signal<number | undefined>(parseClassFilter(this.route.snapshot.queryParamMap.get('class')));
  readonly specFilter = signal<string | undefined>(
    parseSpecFilter(this.classFilter(), this.route.snapshot.queryParamMap.get('spec')));
  readonly period = signal<LeaderboardPeriod>(
    this.route.snapshot.queryParamMap.get('period') === 'week' ? 'week' : 'season');

  readonly classOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All classes' },
    ...Object.entries(CLASS_NAMES).map(([id, name]) => ({
      value: Number(id),
      label: name,
      icon: getClassIconPath(Number(id)),
      color: getClassColor(Number(id))
    }))
  ];

  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const classId = this.classFilter();
    return [
      { value: undefined, label: 'All specs' },
      ...LEGION_SPECS
        .filter(spec => spec.classId === classId)
        .map(spec => ({ value: spec.spec, label: spec.spec, icon: spec.icon }))
    ];
  });

  /** The realms in the export, the one with the most players first. */
  readonly realmOptions = computed<FilterDropdownOption[]>(() => {
    const players = new Map<string, number>();
    for (const [, realm] of this.index()?.players ?? []) {
      players.set(realm, (players.get(realm) ?? 0) + 1);
    }

    return [
      { value: undefined, label: 'All realms' },
      ...[...players].sort((a, b) => b[1] - a[1]).map(([realm]) => ({ value: realmSlug(realm), label: realm }))
    ];
  });

  private readonly realmName = computed(() => {
    const realm = this.realmFilter();
    return realm && (this.realmOptions().find(option => option.value === realm)?.label ?? realm);
  });

  /** The realm / class / spec filters in use, as chips under the phone Filters button. */
  readonly activeFilterLabels = computed(() => {
    const classId = this.classFilter();
    return [
      this.realmName(),
      classId === undefined ? undefined : [this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ')
    ].filter((label): label is string => !!label);
  });

  /** Every character in the export, to match `?character=` against. */
  private readonly indexCharacters = computed(() =>
    (this.index()?.players ?? []).map(([name, realm, , classId]) => ({ name, realm, classId })));

  /** The character `?character=` names, matched to the export so a typed `progtrix-evermoon` works too. */
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
      profileLink: characterProfileLink(character)
    };
  });

  private decodeRuns?: (file: MythicPlusDungeonFile) => MythicPlusRun[];
  private readonly requestedDungeons = new Set<string>();
  /** Set once a dungeon file from another export made the page load everything again. */
  private reloadedForNewerData = false;

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  readonly selectedDungeon = computed(() =>
    this.dungeons().find(dungeon => dungeon.id === this.selectedDungeonId()));
  readonly selectedDungeonTimer = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? formatClock(dungeon.timerSeconds) : undefined;
  });

  private readonly dungeonsById = computed(() =>
    new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly affixesById = computed(() =>
    new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  /** Worked out from the runs loaded so far; the leaderboard files carry no week of their own. */
  readonly affixWeek = computed(() => currentAffixWeek([...this.runsByDungeon().values()].flat()));
  readonly weekAffixes = computed(() => {
    const affixes = this.affixesById();
    return (this.affixWeek()?.affixes ?? [])
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined);
  });

  /** Run colours are relative to the season's best run, whichever dungeon is shown. */
  private readonly seasonBestScore = computed(() =>
    Math.max(0, ...this.dungeons().map(dungeon => dungeon.bestScore)));

  /** Runs in the selected scope, best first; undefined until every file the scope needs has loaded. */
  readonly scopeRuns = computed<readonly MythicPlusRun[] | undefined>(() => {
    const since = this.period() === 'week' ? this.affixWeek()?.since : undefined;
    const inPeriod = (runs: readonly MythicPlusRun[]) => since === undefined
      ? runs
      : runs.filter(run => Date.parse(run.completedAt) >= since);
    const loaded = this.runsByDungeon();
    const dungeon = this.selectedDungeon();
    if (dungeon) {
      const runs = loaded.get(dungeon.id);
      return runs && rankRuns(inPeriod(runs));
    }

    const dungeons = this.dungeons();
    if (dungeons.some(entry => !loaded.has(entry.id))) {
      return undefined;
    }

    return rankRuns(inPeriod(dungeons.flatMap(entry => loaded.get(entry.id) ?? [])));
  });

  readonly runsLoading = computed(() => !this.isLoading() && !this.loadError() && this.scopeRuns() === undefined);

  /** Raw runs in the selected scope, for the spec popularity chart. */
  readonly dungeonRuns = computed(() => this.scopeRuns() ?? []);

  private readonly rankedRuns = computed<RankedRun[]>(() =>
    this.dungeonRuns().map((run, index) => ({ run, rank: index + 1 })));

  /** Ranks are per dungeon filter (like raider.io); the player search narrows rows without renumbering them. */
  readonly filteredRows = computed<RankedRun[]>(() => {
    const ranked = this.rankedRuns();
    const character = this.characterFilter();
    if (character) {
      return ranked.filter(entry => runIncludesCharacter(entry.run, character.key));
    }

    const query = this.search();
    return query.trim() ? ranked.filter(entry => runIncludesPlayer(entry.run, query)) : ranked;
  });

  /** Characters in the selected scope by player score; only worked out once the players view is opened. */
  private readonly rankedPlayers = computed<RankedPlayer[]>(() => {
    const realm = this.realmFilter();
    const classId = this.classFilter();
    const spec = this.specFilter();
    // A spec filter scores each character on the runs they played as that spec only.
    const include = realm === undefined && classId === undefined
      ? undefined
      : (member: MythicPlusMember) => (realm === undefined || realmSlug(member.realm) === realm)
        && (classId === undefined || (member.class === classId && (spec === undefined || member.spec === spec)));

    return rankPlayers(this.dungeonRuns(), include).map((player, index) => ({ player, rank: index + 1 }));
  });

  readonly filteredPlayers = computed<RankedPlayer[]>(() => {
    const query = this.search();
    const ranked = this.rankedPlayers();
    return query.trim() ? ranked.filter(entry => memberNameMatches(entry.player.member, query)) : ranked;
  });

  readonly resultCount = computed(() =>
    this.view() === 'players' ? this.filteredPlayers().length : this.filteredRows().length);
  readonly resultUnit = computed(() => {
    const single = this.resultCount() === 1;
    return this.view() === 'players' ? (single ? 'player' : 'players') : (single ? 'run' : 'runs');
  });

  readonly totalPages = computed(() => pageCount(this.resultCount(), this.pageSize()));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  /** Only the visible page is turned into display rows; a season holds tens of thousands of runs. */
  readonly pagedRows = computed<RunRow[]>(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    const dungeons = this.dungeonsById();
    const affixes = this.affixesById();
    const bestScore = this.seasonBestScore();

    return this.filteredRows().slice(start, start + size).flatMap(({ run, rank }) => {
      const dungeon = dungeons.get(run.dungeon);
      return dungeon ? [{ ...toRunView(run, dungeon, affixes, bestScore), rank }] : [];
    });
  });

  /** Dungeons the players table has a best-run column for: the selected one, or all of them. */
  readonly playerDungeons = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? [dungeon] : this.dungeons();
  });

  readonly pagedPlayers = computed<PlayerRow[]>(() => {
    const size = this.pageSize();
    const start = (this.currentPage() - 1) * size;
    const dungeons = this.playerDungeons();
    const topScore = this.rankedPlayers()[0]?.player.score ?? 0;

    return this.filteredPlayers().slice(start, start + size).map(({ player, rank }) => ({
      key: player.key,
      rank,
      member: toMemberView(player.member),
      score: player.score,
      quality: scoreQuality(player.score, topScore),
      bests: dungeons.map(dungeon => {
        const run = player.bestRuns.get(dungeon.id);
        return run && {
          dungeon,
          keyLevel: run.keyLevel,
          timed: keystoneUpgrades(run.clearTimeSeconds, dungeon.timerSeconds) > 0,
          upgrades: keystoneUpgrades(run.clearTimeSeconds, dungeon.timerSeconds),
          clearTime: formatDuration(run.clearTimeSeconds),
          score: run.score
        };
      })
    }));
  });

  /** Runs view with a character filter: how many runs they have in the selected scope. */
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

  readonly emptyMessage = computed(() => {
    const query = this.search().trim();
    const dungeon = this.selectedDungeon();
    const character = this.characterFilter();

    if (character && this.view() === 'runs') {
      return `No runs with ${character.name} (${character.realm})${dungeon ? ` in ${dungeon.name}` : ''}.`;
    }

    if (query) {
      const subject = this.view() === 'players' ? 'No players matching' : 'No runs with a player matching';
      return `${subject} "${query}"${dungeon ? ` in ${dungeon.name}` : ''}.`;
    }

    const classId = this.classFilter();
    const realm = this.realmName();
    if (this.view() === 'players' && (classId !== undefined || realm)) {
      const who = classId === undefined ? 'player' : [this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ');
      return `No ${who}${realm ? ` on ${realm}` : ''} has a run${dungeon ? ` in ${dungeon.name}` : ''} yet.`;
    }

    if (this.period() === 'week') {
      return dungeon ? `No ${dungeon.name} runs yet this week.` : 'No runs yet this week.';
    }

    return dungeon ? `No ${dungeon.name} runs recorded yet.` : 'No runs recorded yet this season.';
  });

  ngOnInit(): void {
    this.loadData();
  }

  retryLoad(): void {
    if (this.reloadedForNewerData) {
      this.startOver();
    } else if (this.index()) {
      this.loadError.set(undefined);
      this.loadScopeRuns();
    } else {
      this.loadData();
    }
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
    if (view === this.view()) {
      return;
    }

    this.view.set(view);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  selectDungeon(dungeonId: string | undefined): void {
    this.selectedDungeonId.set(dungeonId);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
    this.loadScopeRuns();
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
      this.leaderboardRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    // Search isn't in the URL, so the URL only changes when it replaces a character or resets `?page`.
    if (this.characterParam() || this.page() !== 1) {
      this.characterParam.set(undefined);
      this.page.set(1);
      this.syncQueryParams();
    }
  }

  toggleRun(runId: string): void {
    this.expandedRunId.update(current => current === runId ? undefined : runId);
  }

  trackDungeon(index: number, dungeon: MythicPlusDungeon): string {
    return dungeon.id;
  }

  /**
   * Mirrors the filters into the address bar so links and reloads keep them. This writes the
   * URL directly instead of navigating: every router navigation scrolls to the top
   * (scrollPositionRestoration) and runs a full-page view transition, and a filter change
   * should leave the reader where they are.
   */
  private syncQueryParams(): void {
    const players = this.view() === 'players';
    const character = this.characterFilter();
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        dungeon: this.selectedDungeon()?.id ?? null,
        period: this.period() === 'week' ? 'week' : null,
        view: players ? 'players' : null,
        // The filters only apply to the players view; they wait there when the runs view is open.
        realm: players ? this.realmFilter() ?? null : null,
        class: players ? this.classFilter() ?? null : null,
        spec: players ? this.specFilter() ?? null : null,
        character: character ? characterParam(character) : null,
        page: this.currentPage() > 1 ? this.currentPage() : null
      }
    });

    this.location.replaceState(this.router.serializeUrl(url));
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.dataFiles.getJson<MythicPlusIndex>(`${MYTHIC_PLUS_DATA_DIR}/index.json`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.decodeRuns = createRunDecoder(index);
          this.index.set(index);
          this.isLoading.set(false);
          this.loadScopeRuns();
        },
        error: error => this.failLoad(error)
      });
  }

  /** Fetches the dungeon files the selected scope still needs: one dungeon, or all of them. */
  private loadScopeRuns(): void {
    const decode = this.decodeRuns;
    const index = this.index();
    if (!decode || !index) {
      return;
    }

    const selected = this.selectedDungeon();
    const needed = selected ? [selected] : this.dungeons();

    for (const dungeon of needed) {
      if (this.requestedDungeons.has(dungeon.id)) {
        continue;
      }

      this.requestedDungeons.add(dungeon.id);
      // fetchJson rather than getJson: the decoded runs are what we keep, not the raw file.
      this.dataFiles.fetchJson<MythicPlusDungeonFile>(`${MYTHIC_PLUS_DATA_DIR}/${dungeon.id}.json`)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: file => {
            // A file requested before startOver(): the page has moved on to a newer index.
            if (decode !== this.decodeRuns) {
              return;
            }
            if (!sharesTables(index, file)) {
              this.reloadForNewerData(dungeon.id);
              return;
            }
            const runs = decode(file);
            this.runsByDungeon.update(loaded => new Map(loaded).set(dungeon.id, runs));
          },
          error: error => {
            if (decode !== this.decodeRuns) {
              return;
            }
            this.requestedDungeons.delete(dungeon.id);
            this.failLoad(error);
          }
        });
    }
  }

  /**
   * A dungeon file from another export than the index, usually because a deploy landed while
   * the tab was open. Loads everything again once; a second mismatch means the deploy is still
   * going out, and is reported instead of retried in a loop.
   */
  private reloadForNewerData(dungeonId: string): void {
    const firstTime = !this.reloadedForNewerData;
    this.reloadedForNewerData = true;
    if (firstTime) {
      this.startOver();
      return;
    }

    this.decodeRuns = undefined;
    this.failLoad(new Error(`${dungeonId}.json and index.json come from different exports`), NEWER_DATA_MESSAGE);
  }

  /** Drops every loaded file and the session's manifest, then loads the page from scratch. */
  private startOver(): void {
    this.dataFiles.refresh();
    this.decodeRuns = undefined;
    this.requestedDungeons.clear();
    this.runsByDungeon.set(new Map());
    this.expandedRunId.set(undefined);
    this.loadData();
  }

  private failLoad(error: unknown, message = 'The Mythic+ leaderboard could not be loaded.'): void {
    console.error('Failed to load Mythic+ leaderboard:', error);
    this.loadError.set(message);
    this.isLoading.set(false);
  }
}
