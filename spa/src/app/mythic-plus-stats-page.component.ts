import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import {
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusAffix,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusRun,
  createRunDecoder,
  currentAffixWeek
} from './mythic-plus';
import {
  DayActivity,
  LEVEL_BANDS,
  LevelBand,
  affixWeeks,
  countTicks,
  dungeonTimers,
  isTimed,
  keyLevelSpread,
  localDay,
  runsPerDay,
  runsPerDungeon,
  weekSummaries
} from './mythic-plus-activity';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { DataFileService } from './services/data-file.service';
import { TapTooltipDirective } from './tap-tooltip.directive';
import { UpdateBarComponent } from './update-bar.component';

/** Season: every run. Week: only runs with the current week's affixes (as on /mythic-plus). */
type StatsPeriod = 'season' | 'week';
/** How the runs-per-day bars are split. */
type DaySplit = 'level' | 'result';
/** How the runs-per-dungeon bars are split. */
type DungeonSplit = 'result' | 'week';

interface Segment {
  key: string;
  label: string;
  count: number;
  percent: number;
}

interface DayBar {
  day: DayActivity;
  label: string;
  longLabel: string;
  showLabel: boolean;
  /** Today: the day is not over yet. */
  partial: boolean;
  heightPercent: number;
  /** Bottom to top. */
  segments: Segment[];
  flip: boolean;
}

interface WeekBand {
  start: number;
  span: number;
  affixes: MythicPlusAffix[];
  shade: boolean;
}

const RESULT_SEGMENTS: ReadonlyArray<{ key: 'timed' | 'depleted'; label: string }> = [
  { key: 'timed', label: 'Timed' },
  { key: 'depleted', label: 'Depleted' }
];

const WEEK_SEGMENTS: ReadonlyArray<{ key: 'fortified' | 'tyrannical'; label: string }> = [
  { key: 'fortified', label: 'Fortified' },
  { key: 'tyrannical', label: 'Tyrannical' }
];

const percentOf = (part: number, whole: number) => whole > 0 ? (part / whole) * 100 : 0;
const formatPercent = (part: number, whole: number) => `${Math.round(percentOf(part, whole))}%`;

/**
 * /mythic-plus/stats: how much Mythic+ is being played. Runs per day, per dungeon and per key
 * level for the season or the current affix week, and every affix week side by side.
 * Reads the same data files as the leaderboard.
 */
@Component({
  selector: 'app-mythic-plus-stats-page',
  standalone: true,
  imports: [CommonModule, RouterLink, UpdateBarComponent, BackToTopButtonComponent, TapTooltipDirective, FilterDropdownComponent],
  templateUrl: './mythic-plus-stats-page.component.html',
  styleUrl: './mythic-plus-stats-page.component.scss',
  // Keeps one of this page's dropdowns open at a time.
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The weeks table's affix tooltip is fixed to the viewport, so it would stay behind on scroll.
  host: { '(window:scroll)': 'hideAffixTooltip()' }
})
export class MythicPlusStatsPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly levelBands = LEVEL_BANDS;
  readonly resultSegments = RESULT_SEGMENTS;

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly period = signal<StatsPeriod>(this.route.snapshot.queryParamMap.get('period') === 'week' ? 'week' : 'season');
  readonly daySplit = signal<DaySplit>('level');
  readonly dungeonSplit = signal<DungeonSplit>('result');
  readonly dungeonLegend = computed<ReadonlyArray<{ key: string; label: string }>>(() =>
    this.dungeonSplit() === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS);
  readonly levelSplit = signal<DungeonSplit>('result');
  /** Runs per key level for one dungeon, or all of them. */
  readonly levelDungeon = signal<string | undefined>(undefined);
  readonly levelDungeonOptions = computed<FilterDropdownOption[]>(() => [
    { value: undefined, label: 'All dungeons' },
    ...(this.index()?.dungeons ?? []).map(dungeon => ({ value: dungeon.id, label: dungeon.name, icon: dungeon.icon }))
  ]);
  readonly levelLegend = computed<ReadonlyArray<{ key: string; label: string }>>(() =>
    this.levelSplit() === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS);

  private readonly timers = computed(() => dungeonTimers(this.index()?.dungeons ?? []));
  private readonly affixesById = computed(() =>
    new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  readonly weeks = computed(() => affixWeeks(this.allRuns()));
  readonly currentWeek = computed(() => currentAffixWeek(this.allRuns()));
  readonly weekAffixes = computed(() => this.affixList(this.currentWeek()?.affixes ?? []));

  /** Runs in the selected period. */
  readonly runs = computed(() => {
    const since = this.period() === 'week' ? this.currentWeek()?.since : undefined;
    const runs = this.allRuns();
    return since === undefined ? runs : runs.filter(run => Date.parse(run.completedAt) >= since);
  });

  readonly summary = computed(() => {
    const runs = this.runs();
    const timers = this.timers();
    const players = new Set<string>();
    let timed = 0;
    let highestTimed = 0;
    for (const run of runs) {
      if (isTimed(run, timers)) {
        timed++;
        highestTimed = Math.max(highestTimed, run.keyLevel);
      }
      for (const member of run.roster) {
        players.add(`${member.name}-${member.realm}`);
      }
    }
    const days = this.days().length;
    return [
      { label: 'Runs', value: runs.length.toLocaleString('en-GB') },
      { label: 'Runs per day', value: days ? Math.round(runs.length / days).toLocaleString('en-GB') : '-' },
      { label: 'Finished in time', value: formatPercent(timed, runs.length) },
      { label: 'Highest timed key', value: highestTimed ? `+${highestTimed}` : '-' },
      { label: 'Players', value: players.size.toLocaleString('en-GB') }
    ];
  });

  // Runs per day
  readonly days = computed(() => runsPerDay(this.runs(), this.timers(), this.weeks()));
  readonly dayTicks = computed(() => countTicks(Math.max(0, ...this.days().map(day => day.total))));
  readonly dayGridlines = computed(() => this.gridlines(this.dayTicks()));
  readonly dayBars = computed<DayBar[]>(() => {
    const days = this.days();
    const top = this.dayTicks()[this.dayTicks().length - 1];
    const labelEvery = Math.max(1, Math.ceil(days.length / 16));
    const split = this.daySplit();
    const today = localDay(new Date());
    return days.map((day, position) => {
      const date = new Date(`${day.day}T12:00:00`);
      const segments = split === 'level'
        ? LEVEL_BANDS.map(({ band, label }) => this.segment(band, label, day[band as LevelBand], day.total))
        : RESULT_SEGMENTS.map(({ key, label }) => this.segment(key, label, day[key], day.total));
      return {
        day,
        label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        longLabel: date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
        showLabel: position % labelEvery === 0,
        partial: day.day === today,
        heightPercent: percentOf(day.total, top),
        segments,
        flip: position >= days.length / 2
      };
    });
  });
  readonly weekBands = computed<WeekBand[]>(() => {
    const bands: WeekBand[] = [];
    this.days().forEach((day, position) => {
      const last = bands[bands.length - 1];
      if (last && last.start + last.span === position + 1 && this.days()[position - 1]?.week === day.week) {
        last.span++;
        return;
      }
      const week = this.weeks()[day.week];
      bands.push({
        start: position + 1,
        span: 1,
        affixes: week ? this.affixList(week.affixes) : [],
        shade: day.week % 2 === 0
      });
    });
    return bands;
  });

  // Runs per dungeon
  readonly dungeons = computed(() => {
    const rows = runsPerDungeon(this.runs(), this.index()?.dungeons ?? [], this.weeks());
    const top = Math.max(1, ...rows.map(row => row.runs));
    const split = this.dungeonSplit();
    return rows.map(row => ({
      ...row,
      segments: (split === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS)
        .map(({ key, label }) => ({ key, label, count: row[key], width: percentOf(row[key], top) })),
      timedRate: formatPercent(row.timed, row.runs)
    }));
  });

  // Key levels
  readonly levels = computed(() => {
    const dungeon = this.levelDungeon();
    const runs = dungeon ? this.runs().filter(run => run.dungeon === dungeon) : this.runs();
    return keyLevelSpread(runs, this.timers(), this.weeks());
  });
  readonly levelTicks = computed(() => countTicks(Math.max(0, ...this.levels().map(level => level.runs))));
  readonly levelGridlines = computed(() => this.gridlines(this.levelTicks()));
  readonly levelBars = computed(() => {
    const top = this.levelTicks()[this.levelTicks().length - 1];
    const levels = this.levels();
    const split = this.levelSplit();
    return levels.map((level, position) => ({
      ...level,
      heightPercent: percentOf(level.runs, top),
      segments: (split === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS)
        .map(({ key, label }) => this.segment(key, label, level[key], level.runs)),
      timedRate: formatPercent(level.timed, level.runs),
      flip: position >= levels.length / 2
    }));
  });

  // Affix weeks (always the whole season)
  readonly weekRows = computed(() => {
    const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return weekSummaries(this.allRuns(), this.timers(), this.weeks()).map((row, position, rows) => ({
      ...row,
      affixes: this.affixList(row.week.affixes),
      dates: row.runs ? `${day(row.firstRun)} - ${day(row.lastRun)}` : '-',
      timedRate: formatPercent(row.timed, row.runs),
      current: position === rows.length - 1
    })).reverse();
  });

  /** The affix description shown for the hovered affix in the weeks table, in viewport pixels. */
  readonly affixTooltip = signal<{ text: string; left: number; top?: number; bottom?: number } | undefined>(undefined);

  ngOnInit(): void {
    this.loadData();
  }

  /** Mouse only, like the other affix tooltips. Opens below the affix, or above it near the bottom of the screen. */
  showAffixTooltip(event: PointerEvent, affix: MythicPlusAffix): void {
    if (event.pointerType !== 'mouse' || !affix.description) {
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = rect.bottom + 140 < window.innerHeight;
    this.affixTooltip.set({
      text: affix.description,
      left: rect.left,
      top: below ? rect.bottom + 6 : undefined,
      bottom: below ? undefined : window.innerHeight - rect.top + 6
    });
  }

  hideAffixTooltip(): void {
    this.affixTooltip.set(undefined);
  }

  setLevelDungeon(value: FilterDropdownValue): void {
    this.levelDungeon.set(typeof value === 'string' ? value : undefined);
  }

  setPeriod(period: StatsPeriod): void {
    if (period === this.period()) {
      return;
    }
    this.period.set(period);
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: { period: period === 'week' ? 'week' : null }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.dataFiles.getJson<MythicPlusIndex>(`${MYTHIC_PLUS_DATA_DIR}/index.json`)
      .pipe(
        switchMap(index => forkJoin(index.dungeons.map(dungeon =>
          this.dataFiles.fetchJson<MythicPlusDungeonFile>(`${MYTHIC_PLUS_DATA_DIR}/${dungeon.id}.json`)))
          .pipe(map(files => ({ index, files })))),
        takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ index, files }) => {
          const decode = createRunDecoder(index);
          this.index.set(index);
          this.allRuns.set(files.flatMap(file => decode(file)));
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ stats:', error);
          this.loadError.set('The Mythic+ runs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  private affixList(ids: readonly number[]): MythicPlusAffix[] {
    const affixes = this.affixesById();
    return ids.map(id => affixes.get(id)).filter((affix): affix is MythicPlusAffix => affix !== undefined);
  }

  private segment(key: string, label: string, count: number, total: number): Segment {
    return { key, label, count, percent: percentOf(count, total) };
  }

  private gridlines(ticks: number[]): Array<{ value: string; position: number }> {
    const top = ticks[ticks.length - 1];
    return ticks.map(value => ({ value: value.toLocaleString('en-GB'), position: percentOf(value, top) }));
  }
}
