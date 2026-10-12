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
import { CLASS_NAMES } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  BossPerformance,
  FACTION_NAMES,
  ITEM_QUALITY_COLORS,
  MAX_SCORE,
  RAID_PAGE_SIZE,
  RaidBoss,
  RaidCharacter,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMetric,
  RankedScore,
  characterKey,
  defaultDifficulty,
  formatPerSecond,
  nameMatches,
  pageCount,
  performanceQuality,
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

/** `?faction=` spells the side out. */
const FACTION_SLUGS: ReadonlyArray<string> = ['alliance', 'horde'];

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
  // The class, faction and realm dropdowns need it (NG0201 without it).
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
  readonly factionFilter = signal<number | undefined>(parseFaction(this.query.get('faction')));
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

  /** Everyone's score; the filters only pick rows from it. */
  readonly scores = computed(() => {
    const loaded = this.loaded();
    const index = this.index();
    return loaded && index ? scoreCharacters(index.bosses, loaded.bossKills, this.metric()) : [];
  });

  readonly rankings = computed<RankedScore[]>(() => {
    // Ranks hold across the search, so a found character shows their real place.
    const ranked = rankScores(this.scores(), {
      classId: this.classFilter(),
      faction: this.factionFilter(),
      realm: this.realmFilter()
    });
    const query = this.search();
    return query ? ranked.filter(entry => nameMatches(entry.character.name, query)) : ranked;
  });

  /** What 100% is on each boss: the best anyone did there. Read only while the explanation is open. */
  readonly bossTops = computed<BossTop[]>(() => {
    const scores = this.scores();
    return (this.index()?.bosses ?? []).map((boss, bossIndex) => {
      let best: BossTop['best'];
      for (const entry of scores) {
        const value = entry.bosses[bossIndex].value;
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

  readonly factionOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All factions' },
    { value: 0, label: FACTION_NAMES[0] },
    { value: 1, label: FACTION_NAMES[1] }
  ];

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
    this.page.set(1);
    this.writeUrl();
  }

  setClassFilter(value: FilterDropdownValue): void {
    this.classFilter.set(typeof value === 'number' ? value : undefined);
    this.page.set(1);
    this.writeUrl();
  }

  setFactionFilter(value: FilterDropdownValue): void {
    this.factionFilter.set(typeof value === 'number' ? value : undefined);
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

  qualityColor(relative: number): string {
    return ITEM_QUALITY_COLORS[performanceQuality(relative)];
  }

  /** A per-boss bar's tooltip: `Nythendra: 82% of the best (412.3k DPS)`. */
  barTitle(entry: BossPerformance): string {
    if (!entry.best) {
      return `${entry.boss.shortName}: no kill`;
    }
    const percent = Math.round(entry.relative * 1000) / 10;
    return `${entry.boss.shortName}: ${percent}% of the best (${formatPerSecond(entry.value)} ${this.metric().toUpperCase()})`;
  }

  trackScore(index: number, entry: RankedScore): string {
    return characterKey(entry.character);
  }

  trackBoss(index: number, entry: BossPerformance): string {
    return entry.boss.slug;
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
    const faction = this.factionFilter();
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        difficulty: this.difficulty()?.slug ?? null,
        metric: this.metric() === 'dps' ? null : this.metric(),
        class: this.classFilter() ?? null,
        faction: faction === undefined ? null : FACTION_SLUGS[faction],
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

function parseFaction(value: string | null): number | undefined {
  const faction = FACTION_SLUGS.indexOf(value ?? '');
  return faction < 0 ? undefined : faction;
}
