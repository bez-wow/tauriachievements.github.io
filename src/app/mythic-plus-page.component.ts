import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
  CLASS_COLORS,
  CLASS_NAMES,
  MythicPlusAffix,
  MythicPlusDataset,
  MythicPlusDungeon,
  MythicPlusMember,
  MythicPlusRun,
  ROLE_LABELS,
  RunQuality,
  UPGRADE_CUTOFFS,
  formatClock,
  formatDuration,
  formatTimerDelta,
  keystoneUpgrades,
  pageCount,
  rankRuns,
  runIncludesPlayer,
  scoreQuality,
  sortRoster,
  upgradeCutoffs
} from './mythic-plus';
import { MythicPlusPreviewComponent } from './mythic-plus-preview.component';
import { MythicPlusSpecChartComponent } from './mythic-plus-spec-chart.component';
import { specIconFor } from './mythic-plus-stats';
import { UpdateBarComponent } from './update-bar.component';

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

function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function toMemberView(member: MythicPlusMember): MemberView {
  return {
    ...member,
    color: CLASS_COLORS[member.class] ?? '#e0e0e0',
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
  affixes: ReadonlyMap<string, MythicPlusAffix>,
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
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, MythicPlusSpecChartComponent, MythicPlusPreviewComponent],
  templateUrl: './mythic-plus-page.component.html',
  styleUrls: ['./mythic-plus-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild('leaderboard') private leaderboardRef?: ElementRef<HTMLElement>;

  readonly roleLabels = ROLE_LABELS;
  readonly cutoffMarks = UPGRADE_CUTOFFS.filter(cutoff => cutoff.percent < 100);

  /**
   * Pre-season lock: blurs the sample data behind a countdown to the Mythic+ launch.
   * Set to false once real keystone data is in.
   */
  readonly previewLocked = true;

  readonly dataset = signal<MythicPlusDataset | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDungeonId = signal<string | undefined>(
    this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  readonly page = signal(parsePage(this.route.snapshot.queryParamMap.get('page')));
  readonly search = signal('');
  readonly expandedRunId = signal<string | undefined>(undefined);

  readonly dungeons = computed(() => this.dataset()?.dungeons ?? []);
  readonly selectedDungeon = computed(() =>
    this.dungeons().find(dungeon => dungeon.id === this.selectedDungeonId()));
  readonly selectedDungeonTimer = computed(() => {
    const dungeon = this.selectedDungeon();
    return dungeon ? formatClock(dungeon.timerSeconds) : undefined;
  });

  /** Raw runs in the selected dungeon, for the spec popularity chart. */
  readonly dungeonRuns = computed(() => {
    const runs = this.dataset()?.runs ?? [];
    const dungeon = this.selectedDungeon();
    return dungeon ? runs.filter(run => run.dungeon === dungeon.id) : runs;
  });

  readonly runs = computed<RunView[]>(() => {
    const data = this.dataset();
    if (!data) {
      return [];
    }

    const dungeons = new Map(data.dungeons.map(dungeon => [dungeon.id, dungeon]));
    const affixes = new Map(data.affixes.map(affix => [affix.id, affix]));
    const ranked = rankRuns(data.runs);
    const bestScore = ranked[0]?.score ?? 0;

    return ranked.flatMap(run => {
      const dungeon = dungeons.get(run.dungeon);
      return dungeon ? [toRunView(run, dungeon, affixes, bestScore)] : [];
    });
  });

  /** Ranks are per dungeon filter (like raider.io); the player search narrows rows without renumbering them. */
  readonly filteredRows = computed<RunRow[]>(() => {
    const dungeon = this.selectedDungeon();
    const query = this.search();

    return this.runs()
      .filter(run => !dungeon || run.dungeon.id === dungeon.id)
      .map((run, index) => ({ ...run, rank: index + 1 }))
      .filter(row => runIncludesPlayer(row, query));
  });

  readonly totalPages = computed(() => pageCount(this.filteredRows().length, PAGE_SIZE));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pagedRows = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  readonly emptyMessage = computed(() => {
    const query = this.search().trim();
    const dungeon = this.selectedDungeon();

    if (query) {
      return `No runs with a player matching "${query}"${dungeon ? ` in ${dungeon.name}` : ''}.`;
    }

    return dungeon ? `No ${dungeon.name} runs recorded yet.` : 'No runs recorded yet this season.';
  });

  ngOnInit(): void {
    this.loadData();
  }

  retryLoad(): void {
    this.loadData();
  }

  selectDungeon(dungeonId: string | undefined): void {
    this.selectedDungeonId.set(dungeonId);
    this.page.set(1);
    this.expandedRunId.set(undefined);
    this.syncQueryParams();
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

    // Search isn't in the URL, so only navigate when `?page` needs resetting —
    // every router navigation starts a view transition, and per-keystroke ones abort each other.
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

  trackMember(index: number, member: MemberView): string {
    return `${member.name}-${member.realm}`;
  }

  private syncQueryParams(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        dungeon: this.selectedDungeon()?.id ?? null,
        page: this.currentPage() > 1 ? this.currentPage() : null
      },
      replaceUrl: true
    });
  }

  private loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.http.get<MythicPlusDataset>('MythicPlus.json')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.dataset.set(data);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ leaderboard:', error);
          this.loadError.set('The Mythic+ leaderboard could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }
}
