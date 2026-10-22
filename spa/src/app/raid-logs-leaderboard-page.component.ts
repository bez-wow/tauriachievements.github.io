import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { GlideDirective } from './glide.directive';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES, RunQuality, scoreQuality } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  FACTION_NAMES,
  MAX_SCORE,
  RAID_PAGE_SIZE,
  RAID_REALMS,
  RaidBoss,
  RaidCharacter,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMetric,
  RankedScore,
  ScoreChange,
  bossesInKillOrder,
  characterKey,
  countsFor,
  defaultDifficulty,
  formatPerSecond,
  killsBefore,
  nameMatches,
  pageCount,
  raidCharacterLink,
  rankScores,
  realmSlug,
  scoreChanges,
  scoreCharacters
} from './raid-logs';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

interface Loaded {
  difficulty: RaidDifficulty;
  /** Each boss's kills on the difficulty, by boss index. */
  bossKills: RaidKillDetails[][];
}

interface BossTop {
  boss: RaidBoss;
  best?: { value: number; character: RaidCharacter };
}

const METRICS: ReadonlyArray<{ id: RaidMetric; label: string }> = [
  { id: 'dps', label: 'DPS' },
  { id: 'hps', label: 'HPS' }
];

/**
 * /raid-logs/leaderboard: every character on one difficulty by score, their best kill of each
 * boss measured against the best anyone did there (see scoreCharacters). DPS ranks tanks and
 * damage dealers, HPS ranks healers. The difficulty, metric, filters and page live in the query
 * string. Loads the difficulty's seven boss files.
 */
@Component({
  selector: 'app-raid-logs-leaderboard-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    FilterDropdownComponent,
    RaidDifficultySwitchComponent,
    GlideDirective
  ],
  templateUrl: './raid-logs-leaderboard-page.component.html',
  styleUrl: './raid-logs-leaderboard-page.component.scss',
  // The class, spec and realm dropdowns need it (NG0201 without it).
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsLeaderboardPageComponent {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly query = this.route.snapshot.queryParamMap;

  readonly metrics = METRICS;
  readonly maxScore = MAX_SCORE;
  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly loaded = signal<Loaded | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? this.data.lastDifficulty());
  readonly metric = signal<RaidMetric>(this.query.get('metric') === 'hps' ? 'hps' : 'dps');
  readonly classFilter = signal<number | undefined>(parseNumber(this.query.get('class')));
  readonly specFilter = signal<number | undefined>(parseNumber(this.query.get('spec')));
  readonly realmFilter = signal<string | undefined>(this.query.get('realm') ?? undefined);
  readonly search = signal(this.query.get('q') ?? '');
  readonly page = signal(Math.max(1, parseNumber(this.query.get('page')) ?? 1));
  readonly showHelp = signal(false);
  readonly hasFilters = computed(() =>
    this.classFilter() !== undefined || this.specFilter() !== undefined || this.realmFilter() !== undefined);
  /** The ladder's gender where the raid logs have it wrong; until it loads, the raid logs' own. */
  private readonly genders = toSignal(this.data.genders(), { initialValue: new Map<string, number>() as ReadonlyMap<string, number> });

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  /** Everyone's score, every spec counted. What 100% is on each boss comes from it. */
  private readonly allScores = computed(() => {
    const loaded = this.loaded();
    const index = this.index();
    return loaded && index ? scoreCharacters(index.bosses, loaded.bossKills, this.metric()) : [];
  });

  /** With a spec picked, each character scored on the kills played as it; the other filters only pick rows. */
  readonly scores = computed(() => {
    const loaded = this.loaded();
    const index = this.index();
    const spec = this.specFilter();
    if (spec === undefined) {
      return this.allScores();
    }
    return loaded && index ? scoreCharacters(index.bosses, loaded.bossKills, this.metric(), spec) : [];
  });

  /** The filtered ranking, before the search: ranks hold across it, so a found character shows their real place. */
  private readonly ranked = computed<RankedScore[]>(() => rankScores(this.scores(), {
    classId: this.classFilter(),
    realm: this.realmFilter()
  }));

  /** The difficulty's kills as the previous scan had them; undefined while none of them is new. */
  private readonly previousBossKills = computed(() => {
    const loaded = this.loaded();
    const newLogs = this.index()?.newLogs;
    if (!loaded || !newLogs?.size) {
      return undefined;
    }
    const previous = killsBefore(loaded.bossKills, newLogs);
    return previous.some((kills, boss) => kills.length < loaded.bossKills[boss].length) ? previous : undefined;
  });

  /**
   * How each character's rank and score moved since the previous scan, by characterKey: the same
   * ranking (metric, spec, class, realm) worked out without the kills that scan didn't have.
   */
  private readonly changes = computed(() => {
    const previousKills = this.previousBossKills();
    const index = this.index();
    if (!previousKills || !index) {
      return new Map<string, ScoreChange>();
    }
    const previous = scoreCharacters(index.bosses, previousKills, this.metric(), this.specFilter());
    return scoreChanges(this.ranked(), rankScores(previous, { classId: this.classFilter(), realm: this.realmFilter() }));
  });

  /** The scan the changes measure from, for the explanation; undefined when no change shows. */
  readonly changesSince = computed(() => this.previousBossKills() ? this.index()?.previousGeneratedAt : undefined);

  readonly rankings = computed<RankedScore[]>(() => {
    const query = this.search();
    return query ? this.ranked().filter(entry => nameMatches(entry.character.name, query)) : this.ranked();
  });

  /** The top score in view; the score colours measure against it, as the M+ leaderboard's ranks do. */
  private readonly topScore = computed(() => this.ranked()[0]?.score ?? 0);

  /** What 100% is on each boss: the best anyone did there, in kill order. Read only while the explanation is open. */
  readonly bossTops = computed<BossTop[]>(() => {
    const scores = this.allScores();
    return bossesInKillOrder(this.index()?.bosses ?? []).map(boss => {
      let best: BossTop['best'];
      for (const entry of scores) {
        const value = entry.bosses[boss.index].value;
        if (value > (best?.value ?? 0)) {
          best = { value, character: entry.character };
        }
      }
      return { boss, best };
    });
  });

  readonly total = computed(() => this.rankings().length);
  readonly pages = computed(() => pageCount(this.total()));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  readonly shownRankings = computed(() =>
    this.rankings().slice((this.currentPage() - 1) * RAID_PAGE_SIZE, this.currentPage() * RAID_PAGE_SIZE));

  readonly classOptions = computed<FilterDropdownOption[]>(() => {
    const metric = this.metric();
    const ranked = new Set([...(this.index()?.specs.values() ?? [])]
      .filter(spec => countsFor(metric, spec))
      .map(spec => spec.classId));
    return CLASS_FILTER_OPTIONS.filter(option => typeof option.value !== 'number' || ranked.has(option.value));
  });

  /** The picked class's specs that the tab ranks: healers on HPS, everyone else on DPS. */
  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const classId = this.classFilter();
    const metric = this.metric();
    const specs = [...(this.index()?.specs.values() ?? [])]
      .filter(spec => spec.classId === classId && countsFor(metric, spec));
    return [{ value: undefined, label: 'All specs' }, ...specs.map(spec => ({ value: spec.id, label: spec.name, icon: spec.icon }))];
  });

  readonly realmOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All realms' },
    ...RAID_REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];

  /**
   * Every label each dropdown can show, whatever the tab and class: each keeps its longest one's
   * width ("Death Knight", "Beast Mastery"), so picking never cuts a name or moves the toolbar.
   */
  readonly classWidthLabels: ReadonlyArray<string> = ['All classes', ...Object.values(CLASS_NAMES)];
  readonly specWidthLabels = computed<string[]>(() =>
    ['All specs', ...new Set([...(this.index()?.specs.values() ?? [])].map(spec => spec.name))]);
  readonly realmWidthLabels: ReadonlyArray<string> = this.realmOptions.map(option => option.label);

  readonly characterLink = raidCharacterLink;
  readonly classIcon = getClassIconPath;
  readonly formatPerSecond = formatPerSecond;
  readonly factionName = (faction: number) => FACTION_NAMES[faction] ?? '';
  readonly pageSize = RAID_PAGE_SIZE;

  private subscription?: Subscription;

  constructor() {
    this.data.lastDifficulty.set(this.requestedDifficulty());
    this.loadData();
  }

  loadData(): void {
    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.subscription = this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          this.fitFiltersToTab();
          this.loadDifficulty(index);
        },
        error: error => this.fail(error)
      });
  }

  setDifficulty(slug: string): void {
    this.requestedDifficulty.set(slug);
    this.data.lastDifficulty.set(slug);
    this.page.set(1);
    this.writeUrl();
    const index = this.index();
    if (index) {
      this.loadDifficulty(index);
    }
  }

  setMetric(metric: RaidMetric): void {
    if (metric === this.metric()) {
      return;
    }
    this.metric.set(metric);
    this.fitFiltersToTab();
    this.page.set(1);
    this.writeUrl();
  }

  /**
   * Clears a class or spec the tab doesn't rank (a Warrior on HPS): it would empty the list, and
   * the dropdown would show no label for it. Then picks the spec of a class with only one the
   * tab ranks (a Shaman on HPS is Restoration). Runs on a tab switch and once a URL's filters
   * meet the index.
   */
  private fitFiltersToTab(): void {
    if (this.classFilter() !== undefined && !this.classOptions().some(option => option.value === this.classFilter())) {
      this.classFilter.set(undefined);
      this.specFilter.set(undefined);
    }
    if (this.specFilter() !== undefined && !this.specOptions().some(option => option.value === this.specFilter())) {
      this.specFilter.set(undefined);
    }
    this.specFilter.update(spec => spec ?? this.onlyRankedSpec());
  }

  /**
   * The picked class's spec when it is the only one the tab ranks: every healing class but the
   * Priest on HPS. No class has just one on DPS.
   */
  private onlyRankedSpec(): number | undefined {
    const specs = this.specOptions().filter(option => option.value !== undefined);
    return specs.length === 1 ? specs[0].value as number : undefined;
  }

  setClassFilter(value: FilterDropdownValue): void {
    this.classFilter.set(typeof value === 'number' ? value : undefined);
    this.specFilter.set(this.onlyRankedSpec());
    this.page.set(1);
    this.writeUrl();
  }

  setSpecFilter(value: FilterDropdownValue): void {
    this.specFilter.set(typeof value === 'number' ? value : undefined);
    this.page.set(1);
    this.writeUrl();
  }

  /** Clears class, spec and realm, as the M+ leaderboard's Reset does; the search stays. */
  resetFilters(): void {
    this.classFilter.set(undefined);
    this.specFilter.set(undefined);
    this.realmFilter.set(undefined);
    this.page.set(1);
    this.writeUrl();
  }

  setRealmFilter(value: FilterDropdownValue): void {
    this.realmFilter.set(typeof value === 'string' ? value : undefined);
    this.page.set(1);
    this.writeUrl();
  }

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
    this.writeUrl();
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pages()));
    this.writeUrl();
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  /** The race icon, with the ladder's gender: the raid logs make nearly everyone male. */
  raceIcon(character: RaidCharacter): string {
    return getRaceIconPath(character.race, this.genders().get(characterKey(character)) ?? character.gender);
  }

  /** The score's colour, against the top score in view: the M+ leaderboard's scoreQuality. */
  scoreTier(entry: RankedScore): RunQuality {
    return scoreQuality(entry.score, this.topScore());
  }

  trackScore(index: number, entry: RankedScore): string {
    return characterKey(entry.character);
  }

  change(entry: RankedScore): ScoreChange | undefined {
    return this.changes().get(characterKey(entry.character));
  }

  /** "+3", "−12": the minus sign is as wide as the plus, so the digits line up. */
  signed(value: number): string {
    return `${value > 0 ? '+' : '−'}${Math.abs(value)}`;
  }

  rankChangeLabel(change: number): string {
    const ranks = Math.abs(change) === 1 ? 'rank' : 'ranks';
    return `${change > 0 ? 'Climbed' : 'Fell'} ${Math.abs(change)} ${ranks} since the last scan`;
  }

  scoreChangeLabel(change: number): string {
    return `${this.signed(change)} score since the last scan`;
  }

  private loadDifficulty(index: RaidLogsIndex): void {
    const difficulty = this.difficulty();
    if (!difficulty) {
      this.loadError.set('No kills are logged yet.');
      this.isLoading.set(false);
      return;
    }

    this.subscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);
    const files = index.bosses.map(boss => this.data.bossKills(index, boss, difficulty));
    this.subscription = (files.length ? forkJoin(files) : of([]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: bossKills => {
          this.loaded.set({ difficulty, bossKills });
          this.isLoading.set(false);
        },
        error: error => this.fail(error)
      });
  }

  private fail(error: unknown): void {
    console.error('Failed to load the raid leaderboard:', error);
    this.loadError.set('The raid logs could not be loaded.');
    this.isLoading.set(false);
  }

  /** In-page filters keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        difficulty: this.difficulty()?.slug ?? null,
        metric: this.metric() === 'dps' ? null : this.metric(),
        class: this.classFilter() ?? null,
        spec: this.specFilter() ?? null,
        realm: this.realmFilter() ?? null,
        q: this.search() || null,
        page: this.currentPage() > 1 ? this.currentPage() : null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}

function parseNumber(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}
