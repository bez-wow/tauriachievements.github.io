import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { getClassIconPath } from '../../game/classIconHelper';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { getClassColor } from '../../game/class-colors';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  FACTION_NAMES,
  RAID_PAGE_SIZE,
  formatPerSecond,
  nameMatches,
  pageCount,
  raidCharacterLink
} from './raid-display';
import {
  MAX_SCORE,
  RaidMetric,
  RankedScore,
  ScoreChange,
  countsFor,
  killsBefore,
  rankScores,
  rankedSpecs,
  scoreChanges,
  scoreCharacters
} from './raid-scores';
import { RaidBoss, RaidCharacter, RaidDifficulty, RaidKillDetails, RaidLogsIndex } from './raid-logs.types';
import { bossesInKillOrder, characterKey, defaultDifficulty } from './raid-logs';
import { RaidLogsDataService } from './raid-logs-data.service';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES, REALMS, realmSlug } from '../../game/wow';
import { injectReplaceUrl, parseInteger, parsePage } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';
import { RunQuality, scoreQuality } from '../../shared/score-quality';

interface Loaded {
  difficulty: RaidDifficulty;
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

@Component({
  selector: 'app-raid-logs-leaderboard-page',
  imports: [
    RouterLink,
    FilterDropdownComponent,
    RaidDifficultySwitchComponent,
    GlideDirective,
    DatePipe,
    DecimalPipe,
    LoadStateComponent
  ],
  templateUrl: './raid-logs-leaderboard-page.component.html',
  styleUrl: './raid-logs-leaderboard-page.component.scss',
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsLeaderboardPageComponent {
  readonly characterKey = characterKey;

  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly replaceUrl = injectReplaceUrl();

  private readonly query = this.route.snapshot.queryParamMap;

  readonly metrics = METRICS;
  readonly maxScore = MAX_SCORE;
  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly loaded = signal<Loaded | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? this.data.lastDifficulty());
  readonly metric = signal<RaidMetric>(this.query.get('metric') === 'hps' ? 'hps' : 'dps');
  readonly classFilter = signal<number | undefined>(parseInteger(this.query.get('class')));
  readonly specFilter = signal<number | undefined>(parseInteger(this.query.get('spec')));
  readonly realmFilter = signal<string | undefined>(this.query.get('realm') ?? undefined);
  readonly search = signal(this.query.get('q') ?? '');
  readonly page = signal(parsePage(this.query.get('page')));
  readonly showHelp = signal(false);
  readonly hasFilters = computed(() =>
    this.classFilter() !== undefined || this.specFilter() !== undefined || this.realmFilter() !== undefined);
  private readonly genders = toSignal(this.data.genders(), { initialValue: new Map<string, number>() as ReadonlyMap<string, number> });

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });

  private readonly allScores = computed(() => {
    const loaded = this.loaded();
    const index = this.index();
    return loaded && index ? scoreCharacters(index.bosses, loaded.bossKills, this.metric()) : [];
  });

  readonly scores = computed(() => {
    const loaded = this.loaded();
    const index = this.index();
    const spec = this.specFilter();
    if (spec === undefined) {
      return this.allScores();
    }
    return loaded && index ? scoreCharacters(index.bosses, loaded.bossKills, this.metric(), spec) : [];
  });

  private readonly ranked = computed<RankedScore[]>(() => rankScores(this.scores(), {
    classId: this.classFilter(),
    realm: this.realmFilter()
  }));

  private readonly previousBossKills = computed(() => {
    const loaded = this.loaded();
    const newLogs = this.index()?.newLogs;
    if (!loaded || !newLogs?.size) {
      return undefined;
    }
    const previous = killsBefore(loaded.bossKills, newLogs);
    return previous.some((kills, boss) => kills.length < loaded.bossKills[boss].length) ? previous : undefined;
  });

  private readonly changes = computed(() => {
    const previousKills = this.previousBossKills();
    const index = this.index();
    if (!previousKills || !index) {
      return new Map<string, ScoreChange>();
    }
    const previous = scoreCharacters(index.bosses, previousKills, this.metric(), this.specFilter());
    return scoreChanges(this.ranked(), rankScores(previous, { classId: this.classFilter(), realm: this.realmFilter() }));
  });

  readonly changesSince = computed(() => this.previousBossKills() ? this.index()?.previousGeneratedAt : undefined);
  readonly hasChanges = computed(() => this.changes().size > 0);

  readonly rankings = computed<RankedScore[]>(() => {
    const query = this.search();
    return query ? this.ranked().filter(entry => nameMatches(entry.character.name, query)) : this.ranked();
  });

  private readonly topScore = computed(() => this.ranked()[0]?.score ?? 0);

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

  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const index = this.index();
    const specs = index ? rankedSpecs(index.specs, this.classFilter(), this.metric()) : [];
    return [{ value: undefined, label: 'All specs' }, ...specs.map(spec => ({ value: spec.id, label: spec.name, icon: spec.icon }))];
  });

  readonly realmOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All realms' },
    ...REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];

  readonly classWidthLabels: ReadonlyArray<string> = ['All classes', ...Object.values(CLASS_NAMES)];
  readonly specWidthLabels = computed<string[]>(() =>
    ['All specs', ...new Set([...(this.index()?.specs.values() ?? [])].map(spec => spec.name))]);
  readonly realmWidthLabels: ReadonlyArray<string> = this.realmOptions.map(option => option.label);

  readonly characterLink = raidCharacterLink;
  readonly classIcon = getClassIconPath;
  readonly formatPerSecond = formatPerSecond;
  readonly factionName = (faction: number) => FACTION_NAMES[faction] ?? '';

  private subscription?: Subscription;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
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

  raceIcon(character: RaidCharacter): string {
    return getRaceIconPath(character.race, this.genders().get(characterKey(character)) ?? character.gender);
  }

  scoreTier(entry: RankedScore): RunQuality {
    return scoreQuality(entry.score, this.topScore());
  }

  change(entry: RankedScore): ScoreChange | undefined {
    return this.changes().get(characterKey(entry.character));
  }

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

  private writeUrl(): void {
    this.replaceUrl({
      difficulty: this.difficulty()?.slug ?? null,
      metric: this.metric() === 'dps' ? null : this.metric(),
      class: this.classFilter() ?? null,
      spec: this.specFilter() ?? null,
      realm: this.realmFilter() ?? null,
      q: this.search() || null,
      page: this.currentPage() > 1 ? this.currentPage() : null
    });
  }
}
