import { CommonModule, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import { getClassColor } from './class-colors';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownValue } from './filter-dropdown.types';
import { GlideDirective } from './glide.directive';
import { IconTipsComponent } from './icon-tips.component';
import { CLASS_FILTER_OPTIONS, CLASS_NAMES } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  RaidBoss,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidRole,
  RaidTalent,
  RaidTalentTable,
  RaidTalentTooltips,
  RoleFilter,
  defaultDifficulty,
  formatPerSecond,
  iconSrcset,
  itemIconUrl,
  parseRoleFilter,
  raidCharacterLink,
  raidLogLink,
  scoresBySpec,
  specMetric,
  spellUrl
} from './raid-logs';
import {
  NOTABLE_DIFFERENCE,
  NOTABLE_MIN_PICKS,
  SpecTalentSummary,
  TalentBuild,
  TalentChoice,
  TalentSample,
  agreementLabel,
  bossTalentShares,
  buildTalents,
  formatPoints,
  formatShare,
  mostContestedTier,
  mostSettledTier,
  notablePicks,
  sortByPerformance,
  specTalentSummaries,
  specTiers,
  specsMatching,
  talentAgreement,
  talentBuilds,
  talentLevels,
  talentPicks,
  talentSamples,
  talentSwaps,
  topPlayerEdge
} from './raid-talents';
import { RaidLogsDataService } from './services/raid-logs-data.service';
import { UpdateBarComponent } from './update-bar.component';

/** The most played builds the table lists. */
const SHOWN_BUILDS = 10;

/** Below this many characters a spec's shares are flagged as resting on few players. */
const FEW_CHARACTERS = 10;

/** A tier's change rate shows once this many characters killed the bosses it compares. */
const MIN_SWAP_CHARACTERS = 5;

/** A top-player share this far from everyone's is called out beside it. */
const EDGE_POINTS = .05;

const SPEC_COLUMNS = 3;

const ROLE_GROUPS: ReadonlyArray<{ role: RaidRole; title: string; noun: string }> = [
  { role: 'dps', title: 'Damage', noun: 'damage' },
  { role: 'tank', title: 'Tanks', noun: 'tank' },
  { role: 'healer', title: 'Healers', noun: 'healer' }
];

interface StatTile {
  label: string;
  value: string;
  note: string;
}

interface Insight {
  id: string;
  label: string;
  title: string;
  text: string;
  talent?: RaidTalent;
  tone?: 'up' | 'down';
}

interface ChoiceView extends TalentChoice {
  isLeader: boolean;
  /** The top players' share minus everyone's, when it is worth calling out. */
  edge?: string;
  edgeTone?: 'up' | 'down';
}

interface TierView {
  tier: number;
  level: number;
  choices: ChoiceView[];
  /** "21% changed it", when enough characters can be compared. */
  swapNote?: string;
}

interface BuildRow extends TalentBuild {
  rank: number;
  picked: Array<RaidTalent | undefined>;
  /** The meter's length: the share over the most played build's. */
  meter: number;
}

interface HeatCell {
  share: number;
  label: string;
  /** Picked NOTABLE_DIFFERENCE or more above the other bosses. */
  notable: boolean;
  /** Too few picks on the boss to read much into. */
  thin: boolean;
  tip: string;
  tipNote: string;
}

interface HeatRow {
  key: string;
  level: number;
  /** The first of its tier, which carries the level cell. */
  first: boolean;
  tierSize: number;
  talent?: RaidTalent;
  cells: HeatCell[];
}

interface SpecCard extends SpecTalentSummary {
  className: string;
  color: string;
  label: string;
  consensus: Array<{ talent?: RaidTalent; share: number; level: number }>;
}

@Component({
  selector: 'app-raid-logs-talents-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UpdateBarComponent,
    BackToTopButtonComponent,
    FilterDropdownComponent,
    RaidDifficultySwitchComponent,
    IconTipsComponent,
    GlideDirective
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
  private readonly location = inject(Location);

  readonly index = signal<RaidLogsIndex | undefined>(undefined);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly kills = signal<readonly RaidKillDetails[]>([]);
  readonly killsLoading = signal(false);
  readonly killsError = signal<string | undefined>(undefined);
  /** Empty until talents.json loads, or if it doesn't: talents then show unnamed. */
  private readonly talentTable = signal<RaidTalentTable>(new Map());
  readonly talentTooltips = signal<RaidTalentTooltips>(new Map());
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

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

  /** Every character's talents on every boss of the difficulty, for every spec. */
  private readonly samples = computed(() => talentSamples(this.kills()));
  /** The bosses with kills on the difficulty; a boss without any can't be picked. */
  readonly bossesWithKills = computed(() => new Set(this.kills().map(kill => kill.boss)));
  private readonly specScores = computed(() => {
    const kills = this.kills();
    const bosses = this.index()?.bosses ?? [];
    return scoresBySpec(bosses, bosses.map(boss => kills.filter(kill => kill.boss.slug === boss.slug)));
  });

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

  readonly stats = computed<StatTile[]>(() => {
    const picks = this.picks();
    const builds = this.builds();
    const agreement = talentAgreement(picks);
    const boss = this.boss();
    return [
      {
        label: 'Characters',
        value: picks.characters.toLocaleString('en-US'),
        note: boss ? `killed ${boss.shortName}` : `${picks.picks.toLocaleString('en-US')} boss kills counted`
      },
      { label: 'Agreement', value: formatShare(agreement), note: agreementLabel(agreement) },
      {
        label: 'Builds seen',
        value: builds.builds.length.toLocaleString('en-US'),
        note: builds.builds[0] ? `most played: ${formatShare(builds.builds[0].share)}` : '-'
      },
      {
        label: 'Top 10%',
        value: picks.topPicks.toLocaleString('en-US'),
        note: boss ? `best of the ${boss.shortName} ranking` : 'best of each boss ranking'
      }
    ];
  });

  readonly tierViews = computed<TierView[]>(() => {
    const picks = this.picks();
    const swaps = this.swaps();
    const showEdges = picks.topPicks >= 5;
    return picks.tiers.map(tier => {
      const changed = swaps.tiers[tier.tier] ?? 0;
      return {
        tier: tier.tier,
        level: tier.level,
        swapNote: swaps.characters >= MIN_SWAP_CHARACTERS ? `${formatShare(changed / swaps.characters)} changed it` : undefined,
        choices: tier.choices.map((choice): ChoiceView => {
          const difference = choice.topShare - choice.share;
          const isEdge = showEdges && Math.abs(difference) >= EDGE_POINTS;
          return {
            ...choice,
            isLeader: choice === tier.leader,
            edge: isEdge ? formatPoints(difference) : undefined,
            edgeTone: isEdge ? (difference > 0 ? 'up' : 'down') : undefined
          };
        })
      };
    });
  });

  /** What the swap notes on the tiers count. */
  readonly swapExplanation = computed(() => {
    const swaps = this.swaps();
    if (swaps.characters < MIN_SWAP_CHARACTERS) {
      return '';
    }
    const boss = this.boss();
    return boss
      ? `"Changed it": of the ${swaps.characters.toLocaleString('en-US')} who also killed another boss, those who played something else on ${boss.shortName} than they usually do.`
      : `"Changed it": of the ${swaps.characters.toLocaleString('en-US')} who killed two or more bosses, those who didn't play the same talent on all of them.`;
  });

  readonly insights = computed<Insight[]>(() => {
    const picks = this.picks();
    const spec = this.spec();
    if (!spec || !picks.picks) {
      return [];
    }

    const insights: Insight[] = [];
    const plural = `${spec.name} ${this.className()}s`;

    const favoured = topPlayerEdge(picks, 'more');
    if (favoured) {
      insights.push({
        id: 'favoured',
        label: 'Top players favour',
        title: favoured.choice.talent?.name ?? 'Unknown talent',
        talent: favoured.choice.talent,
        tone: 'up',
        text: `${formatShare(favoured.choice.topShare)} of the top 10% take it at level ${favoured.tier.level}, against ${formatShare(favoured.choice.share)} of everyone.`
      });
    }

    const avoided = topPlayerEdge(picks, 'less');
    if (avoided) {
      insights.push({
        id: 'avoided',
        label: 'Top players avoid',
        title: avoided.choice.talent?.name ?? 'Unknown talent',
        talent: avoided.choice.talent,
        tone: 'down',
        text: `Only ${formatShare(avoided.choice.topShare)} of the top 10% take it, against ${formatShare(avoided.choice.share)} of everyone.`
      });
    }

    const contested = mostContestedTier(picks);
    if (contested?.leader) {
      insights.push({
        id: 'contested',
        label: 'Closest call',
        title: `Level ${contested.level}`,
        talent: contested.leader.talent,
        text: contested.choices
          .filter(choice => choice.count)
          .sort((a, b) => b.count - a.count)
          .map(choice => `${choice.talent?.name ?? 'Unknown'} ${formatShare(choice.share)}`)
          .join(' · ')
      });
    }

    const settled = mostSettledTier(picks);
    if (settled?.leader && settled !== contested) {
      insights.push({
        id: 'settled',
        label: 'Most agreed',
        title: settled.leader.talent?.name ?? 'Unknown talent',
        talent: settled.leader.talent,
        text: `${formatShare(settled.leader.share)} of ${plural} take it at level ${settled.level}.`
      });
    }

    const boss = this.boss();
    const shares = boss ? this.bossShares().find(entry => entry.boss === boss) : undefined;
    const notable = shares ? notablePicks(shares)[0] : undefined;
    if (boss && notable) {
      const talent = this.tiers()[notable.tier]?.[notable.column];
      insights.push({
        id: 'boss',
        label: `Picked for ${boss.shortName}`,
        title: talent?.name ?? 'Unknown talent',
        talent,
        tone: 'up',
        text: `${formatShare(notable.share)} take it on ${boss.shortName}, against ${formatShare(notable.elsewhere)} on the other bosses.`
      });
    }

    const swaps = this.swaps();
    if (swaps.characters >= MIN_SWAP_CHARACTERS) {
      const most = swaps.tiers.reduce((best, count, tier) => count > swaps.tiers[best] ? tier : best, 0);
      const level = picks.tiers[most]?.level;
      insights.push(boss
        ? {
          id: 'swaps',
          label: `Changed for ${boss.shortName}`,
          title: `${formatShare(swaps.changed / swaps.characters)} of players`,
          text: `who also killed other bosses played a talent on ${boss.shortName} that they usually don't. Level ${level} changes the most (${formatShare(swaps.tiers[most] / swaps.characters)}).`
        }
        : {
          id: 'swaps',
          label: 'Changed between bosses',
          title: `${formatShare(swaps.changed / swaps.characters)} of players`,
          text: `who killed two or more bosses didn't play one build on all of them. Level ${level} changes the most (${formatShare(swaps.tiers[most] / swaps.characters)}).`
        });
    }

    return insights;
  });

  readonly buildRows = computed<BuildRow[]>(() => {
    const tiers = this.tiers();
    const builds = this.builds().builds;
    const most = builds[0]?.share ?? 0;
    return builds.slice(0, SHOWN_BUILDS).map((build, index) => ({
      ...build,
      rank: index + 1,
      picked: buildTalents(build.talents, tiers),
      meter: most ? build.share / most : 0
    }));
  });
  readonly buildCount = computed(() => this.builds().builds.length);

  readonly heatBosses = computed(() => this.bossShares().map(entry => ({ boss: entry.boss, picks: entry.picks, thin: entry.picks < NOTABLE_MIN_PICKS })));

  readonly heatRows = computed<HeatRow[]>(() => {
    const shares = this.bossShares();
    const notable = shares.map(entry => new Set(notablePicks(entry).map(pick => `${pick.tier}|${pick.column}`)));
    const levels = talentLevels(this.spec()?.classId ?? 0);

    return this.tiers().flatMap((choices, tier) => choices.map((talent, column): HeatRow => ({
      key: `${tier}|${column}`,
      level: levels[tier] ?? 0,
      first: column === 0,
      tierSize: choices.length,
      talent,
      cells: shares.map((entry, bossIndex): HeatCell => {
        const share = entry.shares[tier]?.[column] ?? 0;
        const elsewhere = entry.elsewhere[tier]?.[column] ?? 0;
        return {
          share,
          label: entry.picks ? formatShare(share) : '-',
          notable: notable[bossIndex].has(`${tier}|${column}`),
          thin: entry.picks < NOTABLE_MIN_PICKS,
          tip: `${talent?.name ?? 'Unknown talent'} on ${entry.boss.shortName}`,
          tipNote: entry.picks
            ? `${formatShare(share)} of ${entry.picks.toLocaleString('en-US')} · ${formatShare(elsewhere)} on the other bosses`
            : 'Nobody played the spec here'
        };
      })
    })));
  });

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

  private killsSubscription?: Subscription;

  constructor() {
    this.data.lastDifficulty.set(this.requestedDifficulty());
    this.loadData();
    this.data.talents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(table => this.talentTable.set(table));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.specId.set(parseNumber(params.get('spec')));
        this.bossSlug.set(params.get('boss') ?? undefined);
        this.classFilter.set(parseClass(params.get('class')));
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

  /**
   * A heatmap cell's gold: one hue, stronger with the share. It stops at about half strength so
   * the white figure on it keeps 4.5:1 contrast.
   */
  heatColor(share: number): string {
    return `rgba(247, 181, 0, ${(.04 + share * .5).toFixed(3)})`;
  }

  trackKey(index: number, entry: { key: string }): string {
    return entry.key;
  }

  trackTier(index: number, tier: TierView): number {
    return tier.tier;
  }

  trackColumn(index: number, choice: TalentChoice): number {
    return choice.column;
  }

  trackBuild(index: number, build: BuildRow): string {
    return build.talents;
  }

  trackSpec(index: number, card: SpecCard): number {
    return card.spec.id;
  }

  trackBoss(index: number, entry: { boss: RaidBoss }): string {
    return entry.boss.slug;
  }

  trackId(index: number, entry: { id: string }): string {
    return entry.id;
  }

  trackLabel(index: number, entry: { label: string }): string {
    return entry.label;
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
    const url = this.router.createUrlTree([], { relativeTo: this.route, queryParams: this.queryParams(this.specId()) });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}

function parseNumber(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function talentMetaTitle(difficulty: string, boss: string | undefined): string {
  return `Talent meta · ${difficulty} · ${boss ?? 'All bosses'}`;
}

function parseClass(value: string | null): number | undefined {
  const classId = parseNumber(value);
  return classId !== undefined && CLASS_NAMES[classId] ? classId : undefined;
}
