import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { getClassIconPath } from '../utils/classIconHelper';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { GlideDirective } from './glide.directive';
import { IconTipsComponent } from './icon-tips.component';
import { CLASS_FILTER_OPTIONS } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  ITEM_QUALITY_COLORS,
  RAID_PAGE_SIZE,
  RaidBoss,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidMetric,
  RaidTalent,
  RaidTalentTable,
  RaidTalentTooltips,
  RankedPerformance,
  characterKey,
  defaultDifficulty,
  fastestKills,
  formatAgo,
  formatFightTime,
  formatPerSecond,
  iconSrcset,
  itemIconUrl,
  itemUrl,
  latestKills,
  logKey,
  memberTalents,
  nameMatches,
  pageCount,
  raidBossLink,
  raidCharacterLink,
  raidGuildLink,
  raidLogLink,
  realmSlug,
  rankCharacters,
  spellUrl
} from './raid-logs';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

type BossTab = 'dps' | 'hps' | 'fastest' | 'latest';

const TABS: ReadonlyArray<{ id: BossTab; label: string }> = [
  { id: 'dps', label: 'Damage' },
  { id: 'hps', label: 'Healing' },
  { id: 'fastest', label: 'Fastest kills' },
  { id: 'latest', label: 'Latest kills' }
];

const REALMS: ReadonlyArray<string> = ['Evermoon', 'Tauri', 'WoD'];

interface KillRow {
  rank: number;
  kill: RaidKillDetails;
}

/** A ranking row with the talents its kill was played with, one per tier. */
interface RankingRow extends RankedPerformance {
  talents: Array<RaidTalent | undefined>;
}

interface SummaryTile {
  label: string;
  value: string;
  note: string;
}

/**
 * /raid-logs/boss/:boss: one boss on one difficulty. Damage and healing rankings (each character's
 * best kill, filterable by realm, class, spec and name) and every kill by speed or date. The
 * filters, tab and page live in the query string.
 */
@Component({
  selector: 'app-raid-logs-boss-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    FilterDropdownComponent,
    RaidDifficultySwitchComponent,
    GlideDirective,
    IconTipsComponent
  ],
  templateUrl: './raid-logs-boss-page.component.html',
  styleUrl: './raid-logs-boss-page.component.scss',
  // The class, spec and realm dropdowns need it (NG0201 without it).
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsBossPageComponent {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private readonly query = this.route.snapshot.queryParamMap;

  readonly tabs = TABS;
  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly kills = signal<RaidKillDetails[]>([]);
  /** Empty until talents.json loads, or if it doesn't: the rows then show no talents. */
  private readonly talentTable = signal<RaidTalentTable>(new Map());
  readonly talentTooltips = signal<RaidTalentTooltips>(new Map());
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly now = signal(Date.now());
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly requestedDifficulty = signal(this.query.get('difficulty') ?? undefined);
  readonly tab = signal<BossTab>(parseTab(this.query.get('tab')));
  readonly classFilter = signal<number | undefined>(parseNumber(this.query.get('class')));
  readonly specFilter = signal<number | undefined>(parseNumber(this.query.get('spec')));
  readonly realmFilter = signal<string | undefined>(this.query.get('realm') ?? undefined);
  readonly search = signal(this.query.get('q') ?? '');
  readonly page = signal(Math.max(1, parseNumber(this.query.get('page')) ?? 1));

  readonly boss = computed<RaidBoss | undefined>(() =>
    this.index()?.bosses.find(boss => boss.slug === this.params().get('boss')));

  /** Each difficulty's kill count on this boss, for the switch. */
  readonly bossKillCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const kill of this.index()?.kills ?? []) {
      if (kill.boss === this.boss()) {
        counts.set(kill.difficulty.slug, (counts.get(kill.difficulty.slug) ?? 0) + 1);
      }
    }
    return counts;
  });

  /** The difficulty asked for when this boss has kills on it, else the hardest one that has. */
  readonly difficulty = computed<RaidDifficulty | undefined>(() => {
    const difficulties = this.index()?.difficulties ?? [];
    const counts = this.bossKillCounts();
    const slug = defaultDifficulty(difficulties.map(difficulty => ({ ...difficulty, kills: counts.get(difficulty.slug) ?? 0 })))?.slug;
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && counts.get(difficulty.slug))
      ?? difficulties.find(difficulty => difficulty.slug === slug);
  });

  readonly metric = computed<RaidMetric>(() => this.tab() === 'hps' ? 'hps' : 'dps');
  readonly isRanking = computed(() => this.tab() === 'dps' || this.tab() === 'hps');

  readonly rankings = computed<RankedPerformance[]>(() => {
    if (!this.isRanking()) {
      return [];
    }

    // Ranks hold across the search, so a found character shows their real place.
    const ranked = rankCharacters(this.kills(), this.metric(), {
      classId: this.classFilter(),
      specId: this.specFilter(),
      realm: this.realmFilter()
    });
    const query = this.search();
    return query ? ranked.filter(entry => nameMatches(entry.member.character.name, query)) : ranked;
  });

  readonly killRows = computed<KillRow[]>(() => {
    if (this.isRanking()) {
      return [];
    }

    const ordered = this.tab() === 'fastest' ? fastestKills(this.kills()) : latestKills(this.kills());
    const query = this.search();
    return ordered
      .map((kill, position) => ({ rank: position + 1, kill }))
      .filter(row => !query || nameMatches(row.kill.guild?.name || 'Pickup group', query));
  });

  readonly total = computed(() => this.isRanking() ? this.rankings().length : this.killRows().length);
  readonly pages = computed(() => pageCount(this.total()));
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()));
  /** Talents are looked up for the page's rows only, not for every ranked character. */
  readonly shownRankings = computed<RankingRow[]>(() => {
    const talents = this.talentTable();
    return pageSlice(this.rankings(), this.currentPage())
      .map(entry => ({ ...entry, talents: memberTalents(entry.member, talents) }));
  });
  readonly shownKillRows = computed(() => pageSlice(this.killRows(), this.currentPage()));

  readonly summary = computed<SummaryTile[]>(() => {
    const kills = this.kills();
    const fastest = fastestKills(kills)[0];
    const first = kills[0];
    const dps = rankCharacters(kills, 'dps')[0];
    const hps = rankCharacters(kills, 'hps')[0];
    return [
      { label: 'Kills', value: kills.length.toLocaleString('en-US'), note: `${new Set(kills.flatMap(kill => kill.members.map(member => member.character))).size.toLocaleString('en-US')} characters` },
      {
        label: 'First kill',
        value: first ? new Date(first.killedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '-',
        note: first ? first.guild?.name || 'Pickup group' : 'Nobody yet'
      },
      { label: 'Fastest kill', value: fastest ? formatFightTime(fastest.fightMs) : '-', note: fastest ? fastest.guild?.name || 'Pickup group' : '-' },
      { label: 'Top DPS', value: dps ? formatPerSecond(dps.value) : '-', note: dps ? dps.member.character.name : '-' },
      { label: 'Top HPS', value: hps ? formatPerSecond(hps.value) : '-', note: hps ? hps.member.character.name : '-' }
    ];
  });

  readonly classOptions = CLASS_FILTER_OPTIONS;

  /** Only the specs the tab ranks: healers on Healing, everyone else on Damage. */
  readonly specOptions = computed<FilterDropdownOption[]>(() => {
    const classId = this.classFilter();
    const metric = this.metric();
    const specs = [...(this.index()?.specs.values() ?? [])]
      .filter(spec => spec.classId === classId && (metric === 'hps' ? spec.role === 'healer' : spec.role !== 'healer'));
    return [{ value: undefined, label: 'All specs' }, ...specs.map(spec => ({ value: spec.id, label: spec.name, icon: spec.icon }))];
  });

  readonly realmOptions: ReadonlyArray<FilterDropdownOption> = [
    { value: undefined, label: 'All realms' },
    ...REALMS.map(realm => ({ value: realmSlug(realm), label: realm }))
  ];

  readonly logLink = raidLogLink;
  readonly guildLink = raidGuildLink;
  readonly characterLink = raidCharacterLink;
  readonly bossLink = raidBossLink;
  readonly formatFightTime = formatFightTime;
  readonly formatPerSecond = formatPerSecond;
  readonly classIcon = getClassIconPath;
  readonly icon = itemIconUrl;
  readonly iconSrcset = iconSrcset;
  readonly itemUrl = itemUrl;
  readonly spellUrl = spellUrl;
  readonly pageSize = RAID_PAGE_SIZE;

  /** The query string a boss picker link keeps: the same view of another boss. */
  readonly bossQueryParams = computed(() => ({
    difficulty: this.difficulty()?.slug ?? null,
    tab: this.tab() === 'dps' ? null : this.tab(),
    class: this.isRanking() ? this.classFilter() ?? null : null,
    spec: this.isRanking() ? this.specFilter() ?? null : null,
    realm: this.isRanking() ? this.realmFilter() ?? null : null
  }));

  /** The talent analytics of this boss and difficulty, for the spec filtered on if there is one. */
  readonly talentsQueryParams = computed(() => ({
    difficulty: this.difficulty()?.slug ?? null,
    boss: this.boss()?.slug ?? null,
    spec: this.specFilter() ?? null
  }));

  private killsSubscription?: Subscription;
  private shownBoss?: string;

  constructor() {
    this.loadData();
    this.data.talents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(table => this.talentTable.set(table));

    // A different boss, or a different difficulty: load that boss file.
    effect(() => {
      const index = this.index();
      const boss = this.boss();
      const difficulty = this.difficulty();
      if (index && boss && difficulty) {
        untracked(() => {
          // Another boss from the picker: the component stays, its page and search don't.
          if (this.shownBoss && this.shownBoss !== boss.slug) {
            this.page.set(1);
            this.search.set('');
          }
          this.shownBoss = boss.slug;
          this.loadKills(index, boss, difficulty);
        });
      }
    });
  }

  loadData(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.data.index()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: index => {
          this.index.set(index);
          if (!this.boss()) {
            this.loadError.set('There is no such boss in the raid.');
            this.isLoading.set(false);
          }
        },
        error: error => {
          console.error('Failed to load the raid logs:', error);
          this.loadError.set('The raid logs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  setDifficulty(slug: string): void {
    this.requestedDifficulty.set(slug);
    this.page.set(1);
    this.writeUrl();
  }

  setTab(tab: BossTab): void {
    if (tab === this.tab()) {
      return;
    }
    this.tab.set(tab);
    // A spec of the other metric would empty the list.
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

  qualityColor(quality: number): string {
    return ITEM_QUALITY_COLORS[quality] ?? '#fff';
  }

  ago(kill: RaidKillDetails): string {
    return formatAgo(kill.killedAt, this.now());
  }

  trackPerformance(index: number, entry: RankedPerformance): string {
    return characterKey(entry.member.character);
  }

  trackKillRow(index: number, row: KillRow): string {
    return logKey(row.kill);
  }

  trackBoss(index: number, boss: RaidBoss): string {
    return boss.slug;
  }

  trackLabel(index: number, tile: SummaryTile): string {
    return tile.label;
  }

  private loadKills(index: RaidLogsIndex, boss: RaidBoss, difficulty: RaidDifficulty): void {
    this.killsSubscription?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set(undefined);
    this.killsSubscription = this.data.bossKills(index, boss, difficulty)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: kills => {
          this.kills.set(kills);
          this.now.set(Date.now());
          this.isLoading.set(false);
          this.loadTalentTooltips();
        },
        error: error => {
          console.error('Failed to load the boss kills:', error);
          this.loadError.set(`The ${boss.shortName} kills could not be loaded.`);
          this.isLoading.set(false);
        }
      });
  }

  private loadTalentTooltips(): void {
    this.data.talentTooltips()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tooltips => this.talentTooltips.set(tooltips));
  }

  /** In-page filters keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        ...this.bossQueryParams(),
        q: this.search() || null,
        page: this.currentPage() > 1 ? this.currentPage() : null
      }
    });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}

function parseTab(value: string | null): BossTab {
  return TABS.some(tab => tab.id === value) ? value as BossTab : 'dps';
}

function parseNumber(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function pageSlice<T>(items: readonly T[], page: number): T[] {
  return items.slice((page - 1) * RAID_PAGE_SIZE, page * RAID_PAGE_SIZE);
}
