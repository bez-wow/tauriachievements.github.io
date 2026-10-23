import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { getClassColor } from '../../game/class-colors';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { GlideDirective } from '../../shared/motion/glide.directive';
import { IconTipsComponent } from '../../shared/icon-tips.component';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  RaidBoss,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidTalent,
  RaidTalentTable,
  RaidTalentTooltips
} from './raid-logs.types';
import {
  RoleFilter,
  formatPerSecond,
  iconSrcset,
  itemIconUrl,
  parseRoleFilter,
  raidCharacterLink,
  raidLogLink,
  spellUrl
} from './raid-display';
import { defaultDifficulty } from './raid-logs';
import { scoresBySpecForKills, specMetric } from './raid-scores';
import {
  NOTABLE_DIFFERENCE,
  NOTABLE_MIN_PICKS,
  SpecTalentSummary,
  TalentSample,
  agreementLabel,
  bossTalentShares,
  formatShare,
  sortByPerformance,
  specTalentSummaries,
  specTiers,
  specsMatching,
  talentBuilds,
  talentLevels,
  talentPicks,
  talentSamples,
  talentSwaps
} from './raid-talents';
import {
  heatColor,
  talentBuildRows,
  talentHeatRows,
  talentInsights,
  talentMetaTitle,
  talentStats,
  talentSwapExplanation,
  talentTierViews
} from './raid-talents-views';
import { RaidLogsDataService } from './raid-logs-data.service';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES, parseClassId, Role } from '../../game/wow';
import { injectReplaceUrl, parseInteger } from '../../core/url-state';
import { LoadStateComponent } from '../../shared/load-state.component';
import { setPageHeader } from '../../core/page-header';

const FEW_CHARACTERS = 10;

const SPEC_COLUMNS = 3;

const ROLE_GROUPS: ReadonlyArray<{ role: Role; title: string; noun: string }> = [
  { role: 'dps', title: 'Damage', noun: 'damage' },
  { role: 'tank', title: 'Tanks', noun: 'tank' },
  { role: 'healer', title: 'Healers', noun: 'healer' }
];

interface SpecCard extends SpecTalentSummary {
  className: string;
  color: string;
  label: string;
  consensus: Array<{ talent?: RaidTalent; share: number; level: number }>;
}

@Component({
  selector: 'app-raid-logs-talents-page',
  imports: [
    RouterLink,
    FilterDropdownComponent,
    RaidDifficultySwitchComponent,
    IconTipsComponent,
    GlideDirective,
    DecimalPipe,
    LoadStateComponent
  ],
  templateUrl: './raid-logs-talents-page.component.html',
  styleUrls: ['./raid-logs-talents-page.component.scss', './raid-logs-talents-page.motion.scss'],
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RaidLogsTalentsPageComponent {
  private readonly data = inject(RaidLogsDataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly replaceUrl = injectReplaceUrl();

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly kills = signal<readonly RaidKillDetails[]>([]);
  readonly killsLoading = signal(false);
  readonly killsError = signal<string | undefined>(undefined);
  private readonly talentTable = signal<RaidTalentTable>(new Map());
  readonly talentTooltips = signal<RaidTalentTooltips>(new Map());
  readonly lastEdited = computed(() => this.index()?.generatedAt);

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? this.data.lastDifficulty());
  readonly specId = signal<number | undefined>(undefined);
  private readonly bossSlug = signal<string | undefined>(undefined);
  private readonly classFilter = signal<number | undefined>(undefined);
  private readonly requestedRole = signal<RoleFilter>('all');

  readonly difficulty = computed(() => {
    const difficulties = this.index()?.difficulties ?? [];
    return difficulties.find(difficulty => difficulty.slug === this.requestedDifficulty() && difficulty.kills > 0)
      ?? defaultDifficulty(difficulties);
  });
  readonly boss = computed(() => this.index()?.bosses.find(boss => boss.slug === this.bossSlug()));
  readonly spec = computed(() => {
    const id = this.specId();
    return id === undefined ? undefined : this.index()?.specs.get(id);
  });
  readonly specs = computed(() => [...(this.index()?.specs.values() ?? [])]);
  readonly selectedClass = computed(() => this.spec()?.classId ?? this.classFilter());
  readonly title = computed(() => talentMetaTitle(this.difficulty()?.name ?? '', this.boss()?.shortName));
  readonly titleOptions = computed(() => {
    const index = this.index();
    const bosses = [undefined, ...(index?.bosses ?? []).map(boss => boss.shortName)];
    return (index?.difficulties ?? [])
      .filter(difficulty => difficulty.kills > 0)
      .flatMap(difficulty => bosses.map(boss => talentMetaTitle(difficulty.name, boss)));
  });
  readonly classFilterName = computed(() => {
    const classId = this.classFilter();
    return classId === undefined ? undefined : CLASS_NAMES[classId];
  });
  readonly availableRoles = computed(() => new Set(specsMatching(this.specs(), this.classFilter(), 'all').map(spec => spec.role)));
  readonly role = computed<RoleFilter>(() => {
    const requested = this.requestedRole();
    return requested === 'all' || this.availableRoles().has(requested) ? requested : 'all';
  });
  readonly selectedRole = computed<RoleFilter>(() => this.spec()?.role ?? this.role());
  readonly roleNoun = computed(() => ROLE_GROUPS.find(group => group.role === this.role())?.noun);
  readonly backLabel = computed(() => ['All', this.classFilterName(), this.roleNoun(), 'specs'].filter(Boolean).join(' '));
  readonly hasFilters = computed(() =>
    this.classFilter() !== undefined || this.role() !== 'all' || this.spec() !== undefined || this.boss() !== undefined);

  private readonly samples = computed(() => talentSamples(this.kills()));
  readonly bossesWithKills = computed(() => new Set(this.kills().map(kill => kill.boss)));
  private readonly specScores = computed(() => scoresBySpecForKills(this.index()?.bosses ?? [], this.kills()));

  readonly specGroups = computed(() => {
    const boss = this.boss();
    const samples = boss ? this.samples().filter(sample => sample.boss === boss) : this.samples();
    const specs = specsMatching(this.specs(), this.classFilter(), this.role());
    const cards = specTalentSummaries(samples, specs, this.talentTable()).map((summary): SpecCard => {
      const className = CLASS_NAMES[summary.spec.classId] ?? 'Unknown';
      return {
        ...summary,
        className,
        color: this.classColor(summary.spec.classId),
        label: agreementLabel(summary.agreement),
        consensus: summary.picks.tiers.map(tier => ({ talent: tier.leader?.talent, share: tier.leader?.share ?? 0, level: tier.level }))
      };
    });
    const className = this.classFilterName();
    if (className) {
      return [{ key: 'class', title: className, columns: Math.max(SPEC_COLUMNS, cards.length), cards }];
    }
    const specScores = this.specScores();
    return ROLE_GROUPS
      .map(group => ({
        key: group.role,
        title: group.title,
        columns: SPEC_COLUMNS,
        cards: sortByPerformance(cards.filter(card => card.spec.role === group.role), specScores)
      }))
      .filter(group => group.cards.length);
  });

  private readonly specSamples = computed(() => {
    const spec = this.spec();
    return spec ? this.samples().filter(sample => sample.spec === spec) : [];
  });
  private readonly selected = computed<TalentSample[]>(() => {
    const boss = this.boss();
    return boss ? this.specSamples().filter(sample => sample.boss === boss) : this.specSamples();
  });
  private readonly tiers = computed(() => {
    const spec = this.spec();
    return spec ? specTiers(this.talentTable(), spec) : [];
  });
  readonly picks = computed(() => talentPicks(this.selected(), this.tiers(), talentLevels(this.spec()?.classId ?? 0)));
  private readonly builds = computed(() => talentBuilds(this.selected()));
  private readonly bossShares = computed(() => bossTalentShares(this.specSamples(), this.index()?.bosses ?? [], this.tiers()));
  private readonly swaps = computed(() => talentSwaps(this.specSamples(), this.tiers().length, this.boss()));

  readonly className = computed(() => CLASS_NAMES[this.spec()?.classId ?? 0] ?? '');
  readonly specColor = computed(() => this.classColor(this.spec()?.classId ?? 0));
  readonly metricLabel = computed(() => this.spec() && specMetric(this.spec()!) === 'hps' ? 'HPS' : 'DPS');
  readonly isThin = computed(() => this.picks().characters > 0 && this.picks().characters < FEW_CHARACTERS);

  readonly stats = computed(() => talentStats(this.picks(), this.builds(), this.boss()));

  readonly tierViews = computed(() => talentTierViews(this.picks(), this.swaps()));

  readonly swapExplanation = computed(() => talentSwapExplanation(this.swaps(), this.boss()));

  readonly insights = computed(() => talentInsights({
    picks: this.picks(),
    spec: this.spec(),
    boss: this.boss(),
    bossShares: this.bossShares(),
    tiers: this.tiers(),
    swaps: this.swaps()
  }));

  readonly buildRows = computed(() => talentBuildRows(this.builds().builds, this.tiers()));
  readonly buildCount = computed(() => this.builds().builds.length);

  readonly heatBosses = computed(() => this.bossShares().map(entry => ({ boss: entry.boss, picks: entry.picks, thin: entry.picks < NOTABLE_MIN_PICKS })));

  readonly heatRows = computed(() =>
    talentHeatRows(this.bossShares(), this.tiers(), talentLevels(this.spec()?.classId ?? 0)));

  readonly classOptions = CLASS_FILTER_OPTIONS;
  readonly roleOptions: ReadonlyArray<{ value: RoleFilter; label: string }> = [
    { value: 'all', label: 'All' },
    ...ROLE_GROUPS.map(group => ({ value: group.role, label: group.title }))
  ];
  readonly notableDifference = Math.round(NOTABLE_DIFFERENCE * 100);
  readonly icon = itemIconUrl;
  readonly iconSrcset = iconSrcset;
  readonly spellUrl = spellUrl;
  readonly characterLink = raidCharacterLink;
  readonly logLink = raidLogLink;
  readonly formatShare = formatShare;
  readonly formatPerSecond = formatPerSecond;
  readonly heatColor = heatColor;

  private killsSubscription?: Subscription;

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited() }));
    this.data.lastDifficulty.set(this.requestedDifficulty());
    this.loadData();
    this.data.talents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(table => this.talentTable.set(table));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.specId.set(parseInteger(params.get('spec')));
        this.bossSlug.set(params.get('boss') ?? undefined);
        this.classFilter.set(parseClassId(params.get('class')));
        this.requestedRole.set(parseRoleFilter(params.get('role')));
        const difficulty = params.get('difficulty');
        if (difficulty) {
          this.requestedDifficulty.set(difficulty);
          this.data.lastDifficulty.set(difficulty);
        }
      });

    effect(() => {
      const index = this.index();
      const difficulty = this.difficulty();
      if (index && difficulty) {
        untracked(() => this.loadKills(index, difficulty));
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
          this.isLoading.set(false);
        },
        error: error => {
          console.error('Failed to load the raid logs:', error);
          this.loadError.set('The raid logs could not be loaded.');
          this.isLoading.set(false);
        }
      });
  }

  retryKills(): void {
    const index = this.index();
    const difficulty = this.difficulty();
    if (index && difficulty) {
      this.loadKills(index, difficulty);
    }
  }

  setDifficulty(slug: string): void {
    if (slug === this.difficulty()?.slug) {
      return;
    }
    this.requestedDifficulty.set(slug);
    this.data.lastDifficulty.set(slug);
    this.writeUrl();
  }

  setBoss(boss: RaidBoss | undefined): void {
    this.bossSlug.set(boss?.slug);
    this.writeUrl();
  }

  setClass(value: FilterDropdownValue): void {
    this.classFilter.set(typeof value === 'number' ? value : undefined);
    this.requestedRole.set(this.role());
    this.applyFilters();
  }

  setRole(role: RoleFilter): void {
    this.requestedRole.set(role);
    this.applyFilters();
  }

  resetFilters(): void {
    this.classFilter.set(undefined);
    this.requestedRole.set('all');
    this.bossSlug.set(undefined);
    this.applyFilters();
  }

  queryParams(specId: number | undefined): Record<string, string | number | null> {
    const role = this.role();
    return {
      difficulty: this.difficulty()?.slug ?? null,
      boss: this.boss()?.slug ?? null,
      role: role === 'all' ? null : role,
      class: this.classFilter() ?? null,
      spec: specId ?? null
    };
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#e0e0e0';
  }

  private loadKills(index: RaidLogsIndex, difficulty: RaidDifficulty): void {
    this.killsSubscription?.unsubscribe();
    this.kills.set([]);
    this.killsLoading.set(true);
    this.killsError.set(undefined);
    this.killsSubscription = this.data.difficultyKills(index, difficulty)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: kills => {
          this.kills.set(kills);
          this.killsLoading.set(false);
          this.loadTalentTooltips();
        },
        error: error => {
          console.error('Failed to load the raid rosters:', error);
          this.killsError.set(`The ${difficulty.name} raid rosters could not be loaded.`);
          this.killsLoading.set(false);
        }
      });
  }

  private loadTalentTooltips(): void {
    this.data.talentTooltips()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(tooltips => this.talentTooltips.set(tooltips));
  }

  private applyFilters(): void {
    if (this.specId() === undefined) {
      this.writeUrl();
    } else {
      void this.router.navigate([], { relativeTo: this.route, queryParams: this.queryParams(undefined) });
    }
  }

  private writeUrl(): void {
    this.replaceUrl(this.queryParams(this.specId()));
  }
}
