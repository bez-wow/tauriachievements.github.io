import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, map, switchMap } from 'rxjs';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import {
  MYTHIC_PLUS_DATA_DIR,
  MythicPlusDungeon,
  MythicPlusDungeonFile,
  MythicPlusIndex,
  MythicPlusRun,
  NEWER_DATA_MESSAGE,
  createRunDecoder,
  currentAffixWeek,
  exportedAt,
  formatClock,
  sharesTables,
  upgradeStars
} from './mythic-plus';
import { dungeonTimers } from './mythic-plus-activity';
import {
  Bounty,
  FIRSTS_FROM_LEVEL,
  RecordsRealm,
  bestTimedRun,
  dungeonBounties,
  dungeonRecords,
  formatHeldFor,
  openBounty,
  runsOnRealm,
  serverFirsts
} from './mythic-plus-records';
import { MythicPlusRunDetailsComponent } from './mythic-plus-run-details.component';
import { MemberView, RunView, toRunView } from './mythic-plus-views';
import { DataFileService } from './services/data-file.service';
import { UpdateBarComponent } from './update-bar.component';

/** A list a run can be opened in; the same run can sit in both. */
type RecordsSection = 'record' | 'first';

interface RecordCard {
  dungeon: MythicPlusDungeon;
  /** Undefined until someone times the dungeon. */
  run?: RunView;
  heldFor: string;
}

interface FirstRow {
  level: number;
  run: RunView;
}

interface BountyView {
  key: string;
  /** Undefined for the server-wide bounty. */
  dungeon?: MythicPlusDungeon;
  level: number;
  attempts: number;
  closest?: RunView;
  /** How far over its timer the closest attempt finished: `0:13`. */
  missedBy?: string;
  claimed?: RunView;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

/**
 * /mythic-plus/records: the highest key timed in each dungeon, the first group to time each key
 * level, and the next level nobody has timed yet, with the attempt that came closest. Records
 * are season-wide. Reads the same data files as the leaderboard, all of them.
 */
@Component({
  selector: 'app-mythic-plus-records-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    FilterDropdownComponent,
    MythicPlusRunDetailsComponent
  ],
  templateUrl: './mythic-plus-records-page.component.html',
  styleUrl: './mythic-plus-records-page.component.scss',
  // Keeps the firsts' dungeon dropdown working (NG0201 without it).
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MythicPlusRecordsPageComponent implements OnInit {
  private readonly dataFiles = inject(DataFileService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly firstsFromLevel = FIRSTS_FROM_LEVEL;
  readonly upgradeStars = upgradeStars;

  readonly index = signal<MythicPlusIndex | undefined>(undefined);
  readonly lastEdited = computed(() => exportedAt(this.index()));
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));
  readonly allRuns = signal<readonly MythicPlusRun[]>([]);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  /** Set once files from another export made the page load everything again. */
  private reloadedForNewerData = false;
  /** "Held for" and recent claims count from here: when the runs were loaded. */
  readonly now = signal(Date.now());

  readonly realm = signal<RecordsRealm>(this.route.snapshot.queryParamMap.get('realm') === 'wod' ? 'wod' : 'all');
  /** The firsts of one dungeon (`?dungeon=`), or of all of them. */
  readonly firstsDungeon = signal<string | undefined>(this.route.snapshot.queryParamMap.get('dungeon') ?? undefined);
  /** The open run in each list, so opening a first doesn't close a record further up. */
  readonly expanded = signal<Partial<Record<RecordsSection, string>>>({});

  readonly dungeons = computed(() => this.index()?.dungeons ?? []);
  private readonly dungeonsById = computed(() => new Map(this.dungeons().map(dungeon => [dungeon.id, dungeon])));
  private readonly timers = computed(() => dungeonTimers(this.dungeons()));
  private readonly affixesById = computed(() => new Map((this.index()?.affixes ?? []).map(affix => [affix.id, affix])));
  /** Run colours are relative to the season's best run, as on the leaderboard. */
  private readonly seasonBestScore = computed(() => Math.max(0, ...this.dungeons().map(dungeon => dungeon.bestScore)));

  /** The runs on the chosen realms. */
  readonly runs = computed(() => runsOnRealm(this.allRuns(), this.realm()));

  readonly records = computed<RecordCard[]>(() => {
    const now = this.now();
    return dungeonRecords(this.runs(), this.dungeons()).map(record => ({
      dungeon: record.dungeon,
      run: record.run && this.view(record.run),
      heldFor: record.run ? formatHeldFor(Date.parse(record.run.completedAt), now) : ''
    }));
  });

  /** The dungeon the firsts are shown for, when `?dungeon=` names one. */
  readonly selectedFirstsDungeon = computed(() => this.dungeonsById().get(this.firstsDungeon() ?? ''));
  /** The dropdown's value. Undefined, not the template's `?.` null, so "All dungeons" shows as selected. */
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

  readonly summary = computed<SummaryTile[]>(() => {
    const records = this.records();
    const top = records[0]?.run;
    const bounty = this.serverBounty();
    const week = currentAffixWeek(this.allRuns());
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

  setRealm(realm: RecordsRealm): void {
    if (realm === this.realm()) {
      return;
    }
    this.realm.set(realm);
    this.expanded.set({});
    this.writeUrl();
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

  trackRecord(index: number, record: RecordCard): string {
    return record.dungeon.id;
  }

  trackFirst(index: number, first: FirstRow): number {
    return first.level;
  }

  trackBounty(index: number, bounty: BountyView): string {
    return bounty.key;
  }

  trackMember(index: number, member: MemberView): string {
    return `${member.name}-${member.realm}`;
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
          // Files from another export than the index (a deploy landed while the tab was open):
          // fetch everything fresh, once. A second mismatch means the deploy is still going out.
          if (files.some(file => !sharesTables(index, file))) {
            this.dataFiles.refresh();
            if (!this.reloadedForNewerData) {
              this.reloadedForNewerData = true;
              this.loadData();
            } else {
              this.loadError.set(NEWER_DATA_MESSAGE);
              this.isLoading.set(false);
            }
            return;
          }

          const decode = createRunDecoder(index);
          this.index.set(index);
          this.allRuns.set(files.flatMap(file => decode(file)));
          this.now.set(Date.now());
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load Mythic+ records:', error);
          this.loadError.set('The Mythic+ runs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  /** Undefined for a run of a dungeon the index doesn't list. */
  private view(run: MythicPlusRun): RunView | undefined {
    const dungeon = this.dungeonsById().get(run.dungeon);
    return dungeon && toRunView(run, dungeon, this.affixesById(), this.seasonBestScore());
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
      // Rounded like the run details' timer delta, so both say the same.
      missedBy: attempt && closest
        ? formatClock(Math.round(attempt.clearTimeSeconds - closest.dungeon.timerSeconds))
        : undefined,
      claimed: bounty.claimed && this.view(bounty.claimed)
    };
  }

  /** In-page filters keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        realm: this.realm() === 'wod' ? 'wod' : null,
        dungeon: this.firstsDungeonId() ?? null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}
