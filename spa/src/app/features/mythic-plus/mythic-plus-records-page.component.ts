import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import {
  MythicPlusDungeon,
  MythicPlusIndex,
  MythicPlusRun,
  currentAffixWeek,
  exportedAt,
  seasonScoreColors
} from './mythic-plus';
import { dungeonTimers } from './mythic-plus-activity';
import {
  Bounty,
  FIRSTS_FROM_LEVEL,
  bestTimedRun,
  dungeonBounties,
  dungeonRecords,
  formatHeldFor,
  mostRuns,
  openBounty,
  serverFirsts
} from './mythic-plus-records';
import { MythicPlusRunDetailsComponent } from './mythic-plus-run-details.component';
import { MemberView, RunView, toMemberView, toRunView } from './mythic-plus-views';
import { CountUpDirective } from '../../shared/motion/count-up.directive';
import { RevealDirective } from '../../shared/motion/reveal.directive';
import { MythicPlusDataService, mythicPlusLoadError } from './mythic-plus-data.service';
import { SpotlightDirective } from '../../shared/motion/spotlight.directive';
import { injectReplaceUrl } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { RunQuality, scoreQuality } from '../../shared/score-quality';
import { formatClock } from '../../shared/time-format';

type RecordsSection = 'record' | 'first';

const STAR_SLOTS: ReadonlyArray<readonly number[]> = [[], [0], [0, 1], [0, 1, 2]];

interface RecordCard {
  dungeon: MythicPlusDungeon;
  run?: RunView;
  heldFor: string;
}

interface FirstRow {
  level: number;
  run: RunView;
}

interface BountyView {
  key: string;
  dungeon?: MythicPlusDungeon;
  level: number;
  attempts: number;
  closest?: RunView;
  missedBy?: string;
  claimed?: RunView;
}

interface RunnerRow {
  key: string;
  rank: number;
  quality: RunQuality;
  member: MemberView;
  runs: number;
  timed: number;
  timedPercent: number;
  highestTimed?: number;
  share: number;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

@Component({
  selector: 'app-mythic-plus-records-page',
  imports: [
    RouterLink,
    FilterDropdownComponent,
    MythicPlusRunDetailsComponent,
    RevealDirective,
    CountUpDirective,
    SpotlightDirective,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    LoadStateComponent
  ],
  templateUrl: './mythic-plus-records-page.component.html',
  styleUrl: './mythic-plus-records-page.component.scss',
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRecordsPageComponent implements OnInit {
  private readonly mythicPlusData = inject(MythicPlusDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly replaceUrl = injectReplaceUrl();

  readonly firstsFromLevel = FIRSTS_FROM_LEVEL;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
  }

  starSlots(upgrades: number): readonly number[] {
    return STAR_SLOTS[upgrades] ?? STAR_SLOTS[0];
  }

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly runs = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly now = signal(Date.now());

  readonly firstsDungeon = signal<string | undefined>(this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  readonly expanded = signal<Partial<Record<RecordsSection, string>>>({});

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  private readonly dungeonsById = computed(() => new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly timers = computed(() => dungeonTimers(this.dungeons()));
  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  private readonly scoreColors = computed(() => seasonScoreColors(this.index()));

  readonly records = computed<RecordCard[]>(() => {
    const now = this.now();
    return dungeonRecords(this.runs(), this.dungeons()).map(record => ({
      dungeon: record.dungeon,
      run: record.run && this.view(record.run),
      heldFor: record.run ? formatHeldFor(Date.parse(record.run.completedAt), now) : ''
    }));
  });

  readonly selectedFirstsDungeon = computed(() => this.dungeonsById().get(this.firstsDungeon() ?? ''));
  readonly firstsDungeonId = computed(() => this.selectedFirstsDungeon()?.id);
  readonly firstsDungeonOptions = computed<FilterDropdownOption[]>(() => [
    { value: undefined, label: 'All dungeons' },
    ...this.dungeons().map(dungeon => ({ value: dungeon.id, label: dungeon.name, icon: dungeon.icon }))
  ]);
  readonly firsts = computed<FirstRow[]>(() => {
    const dungeon = this.firstsDungeonId();
    const runs = dungeon ?this.runs().filter(run => run.dungeon === dungeon) : this.runs();
    return serverFirsts(runs, this.timers()).flatMap(first => {
      const run = this.view(first.run);
      return run ? [{ level: first.level, run }] : [];
    });
  });

  readonly serverBounty = computed(() => this.bountyView('server', openBounty(this.runs(), this.timers(), this.now())));
  readonly bounties = computed(() => dungeonBounties(this.runs(), this.dungeons(), this.now())
    .map(bounty => this.bountyView(bounty.dungeon.id, bounty, bounty.dungeon)));

  readonly mostRuns = computed<RunnerRow[]>(() => {
    const counts = mostRuns(this.runs(), this.timers());
    const top = counts[0]?.runs ?? 0;
    return counts.map((count, index) => ({
      key: count.key,
      rank: index + 1,
      quality: scoreQuality(count.runs, top),
      member: toMemberView(count.member),
      runs: count.runs,
      timed: count.timed,
      timedPercent: Math.round((count.timed / count.runs) * 100),
      highestTimed: count.highestTimed,
      share: top > 0 ? count.runs / top : 0
    }));
  });

  readonly summary = computed<SummaryTile[]>(() => {
    const records = this.records();
    const top = records[0]?.run;
    const bounty = this.serverBounty();
    const week = currentAffixWeek(this.runs());
    const weekRuns = week ? this.runs().filter(run => Date.parse(run.completedAt) >= week.since) : [];
    const weekBest = bestTimedRun(weekRuns, this.timers());
    return [
      {
        label: 'Highest timed key',
        value: top ? `+${top.keyLevel}` : '-',
        note: top
          ? records.filter(record => record.run?.keyLevel === top.keyLevel).map(record => record.dungeon.shortName).join(', ')
          : 'Nobody yet'
      },
      {
        label: 'Next server first',
        value: `+${bounty.level}`,
        note: bounty.closest ? `Closest: ${bounty.closest.dungeon.shortName}, ${bounty.missedBy} over` : 'No attempts yet'
      },
      {
        label: "This week's highest key",
        value: weekBest ? `+${weekBest.keyLevel}` : '-',
        note: weekBest ? this.dungeonsById().get(weekBest.dungeon)?.shortName ?? weekBest.dungeon : 'Nothing timed yet'
      }
    ];
  });

  ngOnInit(): void {
    this.loadData();
  }

  setFirstsDungeon(value: FilterDropdownValue): void {
    this.firstsDungeon.set(typeof value === 'string' ? value : undefined);
    this.writeUrl();
  }

  isExpanded(section: RecordsSection, runId: string): boolean {
    return this.expanded()[section] === runId;
  }

  toggle(section: RecordsSection, runId: string): void {
    this.expanded.update(current => ({ ...current, [section]: current[section] === runId ? undefined : runId }));
  }

  openProfile(runner: RunnerRow): void {
    this.router.navigate(runner.member.profileLink);
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.mythicPlusData.season()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ index, runs }) => {
          this.index.set(index);
          this.runs.set(runs);
          this.now.set(Date.now());
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ records:', error);
          this.loadError.set(mythicPlusLoadError(error));
          this.isLoading.set(false);
        }
      });
  }

  private view(run: MythicPlusRun): RunView | undefined {
    const dungeon = this.dungeonsById().get(run.dungeon);
    return dungeon && toRunView(run, dungeon, this.affixesById(), this.scoreColors());
  }

  private bountyView(key: string, bounty: Bounty<MythicPlusRun>, dungeon?: MythicPlusDungeon): BountyView {
    const attempt = bounty.closest;
    const closest = attempt && this.view(attempt);
    return {
      key,
      dungeon,
      level: bounty.level,
      attempts: bounty.attempts,
      closest,
      missedBy: attempt && closest
        ? formatClock(Math.round(attempt.clearTimeSeconds - closest.dungeon.timerSeconds))
        : undefined,
      claimed: bounty.claimed && this.view(bounty.claimed)
    };
  }

  private writeUrl(): void {
    this.replaceUrl({
      realm: null,
      dungeon: this.firstsDungeonId() ?? null
    });
  }
}
