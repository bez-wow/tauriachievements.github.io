import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  MythicPlusAffix,
  MythicPlusIndex,
  MythicPlusRun,
  currentAffixWeek,
  exportedAt
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
import { injectCompactViewport } from '../../shared/compact-viewport';
import { CountUpDirective } from '../../shared/motion/count-up.directive';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { MYTHIC_PLUS_CARDS_QUERY } from './mythic-plus-views';
import { MythicPlusWeekAffixesComponent } from './mythic-plus-week-affixes.component';
import { RaceBySpecComponent } from '../../shared/spec-charts/race-by-spec.component';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { ScrollToEndDirective } from '../../shared/motion/scroll-to-end.directive';
import { MythicPlusDataService, mythicPlusLoadError } from './mythic-plus-data.service';
import { TapTooltipDirective } from '../../shared/tap-tooltip.directive';
import { Role } from '../../game/wow';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

type StatsPeriod = 'season' | 'week';
type DaySplit = 'level' | 'result';
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
  partial: boolean;
  heightPercent: number;
  segments: Segment[];
  flip: boolean;
  middle: boolean;
  wide: boolean;
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
const isMiddle = (position: number, count: number) => position >= count / 3 && position < (count * 2) / 3;

@Component({
  selector: 'app-mythic-plus-stats-page',
  imports: [
    RouterLink,
    TapTooltipDirective,
    FilterDropdownComponent,
    MythicPlusWeekAffixesComponent,
    RaceBySpecComponent,
    ScrollToEndDirective,
    GlideDirective,
    RevealDirective,
    CountUpDirective,
    DecimalPipe,
    LoadStateComponent
  ],
  templateUrl: './mythic-plus-stats-page.component.html',
  styleUrl: './mythic-plus-stats-page.component.scss',
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:scroll)': 'hideAffixTooltip()' }
})
export class MythicPlusStatsPageComponent implements OnInit {
  private readonly mythicPlusData = inject(MythicPlusDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  readonly levelBands = LEVEL_BANDS;
  readonly resultSegments = RESULT_SEGMENTS;

  readonly cards = injectCompactViewport(MYTHIC_PLUS_CARDS_QUERY);
  private readonly phone = injectCompactViewport();

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly period = signal<StatsPeriod>(this.route.snapshot.queryParamMap.get('period') === 'week' ? 'week' : 'season');
  readonly daySplit = signal<DaySplit>('level');
  readonly dungeonSplit = signal<DungeonSplit>('result');
  readonly dungeonLegend = computed<ReadonlyArray<{ key: string; label: string }>>(() =>
    this.dungeonSplit() === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS);
  readonly levelSplit = signal<DungeonSplit>('result');
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

  readonly runs = computed(() => {
    const since = this.period() === 'week' ? this.currentWeek()?.since : undefined;
    const runs = this.allRuns();
    return since === undefined ? runs : runs.filter(run => Date.parse(run.completedAt) >= since);
  });

  readonly raceRoles: readonly Role[] = ['dps', 'tank', 'healer'];
  readonly rosterSlots = computed(() => this.runs().flatMap(run => run.roster));

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

  readonly days = computed(() => runsPerDay(this.runs(), this.timers(), this.weeks()));
  readonly dayTicks = computed(() => countTicks(Math.max(0, ...this.days().map(day => day.total))));
  readonly dayGridlines = computed(() => this.gridlines(this.dayTicks()));
  readonly dayBars = computed<DayBar[]>(() => {
    const days = this.days();
    const top = this.dayTicks()[this.dayTicks().length - 1];
    const labelEvery = Math.max(1, Math.ceil(days.length / (this.phone() ? 6 : 16)));
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
        flip: position >= days.length / 2,
        middle: isMiddle(position, days.length),
        wide: days.length < 3
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
    const labelEvery = this.phone() && levels.length > 10 ? 2 : 1;
    return levels.map((level, position) => ({
      ...level,
      showLabel: position % labelEvery === 0,
      heightPercent: percentOf(level.runs, top),
      segments: (split === 'result' ? RESULT_SEGMENTS : WEEK_SEGMENTS)
        .map(({ key, label }) => this.segment(key, label, level[key], level.runs)),
      timedRate: formatPercent(level.timed, level.runs),
      flip: position >= levels.length / 2,
      middle: isMiddle(position, levels.length),
      wide: levels.length < 3
    }));
  });

  readonly weekRows = computed(() => {
    const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const weekEnd = (at: number) => {
      const end = new Date(at);
      end.setDate(end.getDate() + 7);
      return end.getTime();
    };
    return weekSummaries(this.allRuns(), this.timers(), this.weeks()).map((row, position, rows) => {
      const current = position === rows.length - 1;
      const lastDay = current ? weekEnd(row.firstRun) : row.lastRun;
      return {
        ...row,
        affixes: this.affixList(row.week.affixes),
        dates: row.runs ? `${day(row.firstRun)} - ${day(lastDay)}` : '-',
        timedRate: formatPercent(row.timed, row.runs),
        current
      };
    }).reverse();
  });

  readonly affixTooltip = signal<{ text: string; left: number; top?: number; bottom?: number } | undefined>(undefined);

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  ngOnInit(): void {
    this.loadData();
  }

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
    this.replaceUrl({ period: period === 'week' ? 'week' : null });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.mythicPlusData.season()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ index, runs }) => {
          this.index.set(index);
          this.allRuns.set(runs);
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ stats:', error);
          this.loadError.set(mythicPlusLoadError(error));
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
