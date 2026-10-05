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
import { ActivatedRoute, Router } from '@angular/router';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import {
  CLASS_NAMES,
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusAffix,
  MythicPlusDungeon,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusMember,
  MythicPlusRun,
  ROLE_LABELS,
  RunQuality,
  UPGRADE_CUTOFFS,
  createRunDecoder,
  formatClock,
  formatDuration,
  formatTimerDelta,
  keystoneUpgrades,
  memberNameMatches,
  pageCount,
  PlayerScore,
  rankPlayers,
  rankRuns,
  runIncludesPlayer,
  scoreQuality,
  sortRoster,
  upgradeCutoffs
} from './mythic-plus';
import { MythicPlusSpecChartComponent } from './mythic-plus-spec-chart.component';
import { LEGION_SPECS, specIconFor } from './mythic-plus-stats';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { UpdateBarComponent } from './update-bar.component';
import { DataFileService } from './services/data-file.service';
import { getClassColor } from './class-colors';

const PAGE_SIZE = 50;

interface MemberView extends MythicPlusMember {
  color: string;
  className: string;
  armoryUrl: string;
  classIcon: string;
  raceIcon: string;
  specIcon?: string;
}

interface CutoffView {
  upgrades: number;
  time: string;
}

interface RunView {
  id: string;
  dungeon: MythicPlusDungeon;
  keyLevel: number;
  upgrades: number;
  clearTime: string;
  clearClock: string;
  timerClock: string;
  timerDelta: string;
  timerPercent: number;
  cutoffs: CutoffView[];
  score: number;
  quality: RunQuality;
  completedAt: string;
  affixes: MythicPlusAffix[];
  tank?: MemberView;
  healer?: MemberView;
  dps: MemberView[];
  roster: MemberView[];
}

interface RunRow extends RunView {
  rank: number;
}

interface RankedRun {
  run: MythicPlusRun;
  rank: number;
}

type LeaderboardView = 'runs' | 'players';

interface RankedPlayer {
  player: PlayerScore;
  rank: number;
}

/** A character's best run in one dungeon, as a cell of the players table. */
interface BestRunCell {
  dungeon: MythicPlusDungeon;
  keyLevel: number;
  timed: boolean;
  clearTime: string;
  score: number;
}

interface PlayerRow {
  key: string;
  rank: number;
  member: MemberView;
  score: number;
  quality: RunQuality;
  /** One per dungeon in scope, in tile order; undefined where the character has no run. */
  bests: Array<BestRunCell | undefined>;
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

function toMemberView(member: MythicPlusMember): MemberView {
  return {
    ...member,
    color: getClassColor(member.class) ?? '#e0e0e0',
    className: CLASS_NAMES[member.class] ?? 'Unknown',
    armoryUrl: getArmoryUrl(member.name, member.realm),
    classIcon: getClassIconPath(member.class),
    raceIcon: getRaceIconPath(member.race, member.gender),
    specIcon: specIconFor(member.class, member.spec)
  };
}

function toRunView(
  run: MythicPlusRun,
  dungeon: MythicPlusDungeon,
  affixes: ReadonlyMap<number, MythicPlusAffix>,
  bestScore: number
): RunView {
  const upgrades = keystoneUpgrades(run.clearTimeSeconds, dungeon.timerSeconds);
  const roster = sortRoster(run.roster).map(toMemberView);

  return {
    id: run.id,
    dungeon,
    keyLevel: run.keyLevel,
    upgrades,
    clearTime: formatDuration(run.clearTimeSeconds),
    clearClock: formatClock(run.clearTimeSeconds),
    timerClock: formatClock(dungeon.timerSeconds),
    timerDelta: formatTimerDelta(run.clearTimeSeconds, dungeon.timerSeconds),
    timerPercent: Math.min(100, (run.clearTimeSeconds / dungeon.timerSeconds) * 100),
    cutoffs: upgradeCutoffs(dungeon.timerSeconds)
      .map(cutoff => ({ upgrades: cutoff.upgrades, time: formatClock(cutoff.seconds) })),
    score: run.score,
    quality: scoreQuality(run.score, bestScore),
    completedAt: run.completedAt,
    affixes: run.affixes
      .map(id => affixes.get(id))
      .filter((affix): affix is MythicPlusAffix => affix !== undefined)
      .sort((a, b) => a.level - b.level),
    tank: roster.find(member => member.role === 'tank'),
    healer: roster.find(member => member.role === 'healer'),
    dps: roster.filter(member => member.role === 'dps'),
    roster
  };
}

@Component({
  selector: 'app-mythic-plus-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, MythicPlusSpecChartComponent, FilterDropdownComponent],
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

  readonly roleLabels = ROLE_LABELS;
  readonly cutoffMarks = UPGRADE_CUTOFFS.filter(cutoff => cutoff.percent < 100);

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  /** Decoded runs per dungeon id, filled as the dungeon files arrive. */
  readonly runsByDungeon = signal<ReadonlyMap<string, readonly MythicPlusRun[]>>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDungeonId = signal<string | undefined>(
    this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  readonly page = signal(parsePage(this.route.snapshot.queryParamMap.get('page')));
  readonly search = signal('');
  readonly expandedRunId = signal<string | undefined>(undefined);
  readonly view = signal<LeaderboardView>(
    this.route.snapshot.queryParamMap.get('view') === 'players' ? 'players' : 'runs');
  /** Players view only: one class, and optionally one of its specs. */
  readonly classFilter = signal<number | undefined>(parseClassFilter(this.route.snapshot.queryParamMap.get('class')));
  readonly specFilter = signal<string | undefined>(
    parseSpecFilter(this.classFilter(), this.route.snapshot.queryParamMap.get('spec')));

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

  private decodeRuns?: (file: MythicPlusDungeonFile) => MythicPlusRun[];
  private readonly requestedDungeons = new Set<string>();

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
  /** Run colours are relative to the season's best run, whichever dungeon is shown. */
  private readonly seasonBestScore = computed(() =>
    Math.max(0, ...this.dungeons().map(dungeon => dungeon.bestScore)));

  /** Runs in the selected scope, best first; undefined until every file the scope needs has loaded. */
  readonly scopeRuns = computed<readonly MythicPlusRun[] | undefined>(() => {
    const loaded = this.runsByDungeon();
    const dungeon = this.selectedDungeon();
    if (dungeon) {
      const runs = loaded.get(dungeon.id);
      return runs && rankRuns(runs);
    }

    const dungeons = this.dungeons();
    if (dungeons.some(entry => !loaded.has(entry.id))) {
      return undefined;
    }

    return rankRuns(dungeons.flatMap(entry => loaded.get(entry.id) ?? []));
  });

  readonly runsLoading = computed(() => !this.isLoading() && !this.loadError() && this.scopeRuns() === undefined);

  /** Raw runs in the selected scope, for the spec popularity chart. */
  readonly dungeonRuns = computed(() => this.scopeRuns() ?? []);

  private readonly rankedRuns = computed<RankedRun[]>(() =>
    this.dungeonRuns().map((run, index) => ({ run, rank: index + 1 })));

  /** Ranks are per dungeon filter (like raider.io); the player search narrows rows without renumbering them. */
  readonly filteredRows = computed<RankedRun[]>(() => {
    const query = this.search();
    const ranked = this.rankedRuns();
    return query.trim() ? ranked.filter(entry => runIncludesPlayer(entry.run, query)) : ranked;
  });

  /** Characters in the selected scope by player score; only worked out once the players view is opened. */
  private readonly rankedPlayers = computed<RankedPlayer[]>(() => {
    const classId = this.classFilter();
    const spec = this.specFilter();
    // A spec filter scores each character on the runs they played as that spec only.
    const include = classId === undefined
      ? undefined
      : (member: MythicPlusMember) => member.class === classId && (spec === undefined || member.spec === spec);

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

  readonly totalPages = computed(() => pageCount(this.resultCount(), PAGE_SIZE));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  /** Only the visible page is turned into display rows; a season holds tens of thousands of runs. */
  readonly pagedRows = computed<RunRow[]>(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    const dungeons = this.dungeonsById();
    const affixes = this.affixesById();
    const bestScore = this.seasonBestScore();

    return this.filteredRows().slice(start, start + PAGE_SIZE).flatMap(({ run, rank }) => {
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
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    const dungeons = this.playerDungeons();
    const topScore = this.rankedPlayers()[0]?.player.score ?? 0;

    return this.filteredPlayers().slice(start, start + PAGE_SIZE).map(({ player, rank }) => ({
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
          clearTime: formatDuration(run.clearTimeSeconds),
          score: run.score
        };
      })
    }));
  });

  readonly emptyMessage = computed(() => {
    const query = this.search().trim();
    const dungeon = this.selectedDungeon();

    if (query) {
      const subject = this.view() === 'players' ? 'No players matching' : 'No runs with a player matching';
      return `${subject} "${query}"${dungeon ? ` in ${dungeon.name}` : ''}.`;
    }

    const classId = this.classFilter();
    if (this.view() === 'players' && classId !== undefined) {
      const who = [this.specFilter(), CLASS_NAMES[classId]].filter(Boolean).join(' ');
      return `No ${who} has a run${dungeon ? ` in ${dungeon.name}` : ''} yet.`;
    }

    return dungeon ? `No ${dungeon.name} runs recorded yet.` : 'No runs recorded yet this season.';
  });

  ngOnInit(): void {
    this.loadData();
  }

  retryLoad(): void {
    if (this.index()) {
      this.loadError.set(undefined);
      this.loadScopeRuns();
    } else {
      this.loadData();
    }
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

  setView(view: LeaderboardView): void {
    if (view === this.view()) {
      return;
    }

    this.view.set(view);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
  }

  /** From a player row: the runs view, searched down to that character. */
  showPlayerRuns(name: string): void {
    this.search.set(name);
    this.view.set('runs');
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
    this.leaderboardRef?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);

    // Search isn't in the URL, so the URL only changes when `?page` needs resetting.
    if (this.page() !== 1) {
      this.page.set(1);
      this.syncQueryParams();
    }
  }

  toggleRun(runId: string): void {
    this.expandedRunId.update(current => current === runId ? undefined : runId);
  }

  isExpanded(runId: string): boolean {
    return this.expandedRunId() === runId;
  }

  trackDungeon(index: number, dungeon: MythicPlusDungeon): string {
    return dungeon.id;
  }

  trackRow(index: number, row: RunRow): string {
    return row.id;
  }

  trackPlayer(index: number, row: PlayerRow): string {
    return row.key;
  }

  trackMember(index: number, member: MemberView): string {
    return `${member.name}-${member.realm}`;
  }

  /**
   * Mirrors the filters into the address bar so links and reloads keep them. This writes the
   * URL directly instead of navigating: every router navigation scrolls to the top
   * (scrollPositionRestoration) and runs a full-page view transition, and a filter change
   * should leave the reader where they are.
   */
  private syncQueryParams(): void {
    const players = this.view() === 'players';
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        dungeon: this.selectedDungeon()?.id ?? null,
        view: players ? 'players' : null,
        // The filters only apply to the players view; they wait there when the runs view is open.
        class: players ? this.classFilter() ?? null : null,
        spec: players ? this.specFilter() ?? null : null,
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
    if (!decode) {
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
            const runs = decode(file);
            this.runsByDungeon.update(loaded => new Map(loaded).set(dungeon.id, runs));
          },
          error: error => {
            this.requestedDungeons.delete(dungeon.id);
            this.failLoad(error);
          }
        });
    }
  }

  private failLoad(error: unknown): void {
    console.error('Failed to load Mythic+ leaderboard:', error);
    this.loadError.set('The Mythic+ leaderboard could not be loaded.');
    this.isLoading.set(false);
  }
}
