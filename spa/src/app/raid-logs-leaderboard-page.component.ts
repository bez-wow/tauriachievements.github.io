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
import { CLASS_NAMES, RunQuality, scoreQuality } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  FACTION_NAMES,
  MAX_SCORE,
  RAID_PAGE_SIZE,
  RaidBoss,
  RaidCharacter,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMetric,
  RankedScore,
  bossesInKillOrder,
  characterKey,
  countsFor,
  defaultDifficulty,
  formatPerSecond,
  nameMatches,
  pageCount,
  raidCharacterLink,
  rankScores,
  realmSlug,
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

const REALMS: ReadonlyArray<string> = ['Evermoon', 'Tauri', 'WoD'];

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

  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? undefined);
  readonly metric = signal<RaidMetric>(this.query.get('metric') === 'hps' ? 'hps' : 'dps');
  readonly classFilter = signal<number | undefined>(parseNumber(this.query.get('class')));
  readonly specFilter = signal<number | undefined>(parseNumber(this.query.get('spec')));
  readonly realmFilter = signal<string | undefined>(this.query.get('realm') ?? undefined);
  readonly search = signal(this.query.get('q') ?? '');
  readonly page = signal(Math.max(1, parseNumber(this.query.get('page')) ?? 1));
  readonly showHelp = signal(false);
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

  readonly classOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All classes' },
    ...Object.entries(CLASS_NAMES).map(([id, name]) => ({
      value: Number(id),
      label: name,
      icon: getClassIconPath(Number(id)),
      color: getClassColor(Number(id))
    }))
  ];

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
    ...REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];

  readonly characterLink = raidCharacterLink;
  readonly classIcon = getClassIconPath;
  readonly formatPerSecond = formatPerSecond;
  readonly factionName = (faction: number) => FACTION_NAMES[faction] ?? '';
  readonly pageSize = RAID_PAGE_SIZE;

  private subscription?: Subscription;

  constructor() {
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
          this.loadDifficulty(index);
        },
        error: error => this.fail(error)
      });
  }

  setDifficulty(slug: string): void {
    this.requestedDifficulty.set(slug);
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
    // A spec the other tab doesn't rank would empty the list.
    if (this.specFilter() !== undefined && !this.specOptions().some(option => option.value === this.specFilter())) {
      this.specFilter.set(undefined);
    }
    this.page.set(1);
    this.writeUrl();
  }

  setClassFilter(value: FilterDropdownValue): void {
    this.classFilter.set(typeof value === 'number' ? value : undefined);
    this.specFilter.set(undefined);
    this.page.set(1);
    this.writeUrl();
  }

  setSpecFilter(value: FilterDropdownValue): void {
    this.specFilter.set(typeof value === 'number' ? value : undefined);
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
