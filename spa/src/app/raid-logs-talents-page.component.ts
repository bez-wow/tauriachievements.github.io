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
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { IconTipsComponent } from './icon-tips.component';
import { CLASS_NAMES } from './mythic-plus';
import { RaidDifficultySwitchComponent } from './raid-difficulty-switch.component';
import {
  RaidBoss,
  RaidDifficulty,
  RaidKillDetails,
  RaidLogsIndex,
  RaidRole,
  RaidSpec,
  RaidTalent,
  RaidTalentTable,
  defaultDifficulty,
  formatPerSecond,
  iconSrcset,
  itemIconUrl,
  raidCharacterLink,
  raidLogLink,
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
  specTalentSummaries,
  specTiers,
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

/** Top players a spec needs for the overview's biggest top-player edge. */
const EDGE_MIN_TOP_PICKS = 20;

const ROLE_GROUPS: ReadonlyArray<{ role: RaidRole; title: string }> = [
  { role: 'dps', title: 'Damage' },
  { role: 'tank', title: 'Tanks' },
  { role: 'healer', title: 'Healers' }
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
  icon?: string;
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

interface Highlight {
  label: string;
  spec: RaidSpec;
  className: string;
  color: string;
  title: string;
  text: string;
}

/**
 * /raid-logs/talents: what raiders pick on every talent tier, on one difficulty and one boss or
 * all of them (`?difficulty=`, `?boss=`). Without `?spec=` it shows every spec's most picked
 * talents; with one, that spec in detail: each tier's picks by everyone and by the top players,
 * the most played builds, how picks differ from boss to boss, and how often players change them.
 * Loads the index, talents.json and the difficulty's seven boss files.
 */
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
    IconTipsComponent
  ],
  templateUrl: './raid-logs-talents-page.component.html',
  styleUrl: './raid-logs-talents-page.component.scss',
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
  readonly lastEdited = computed(() => this.index()?.generatedAt);
  readonly lastEditedTimeZoneLabel = computed(() => getLocalTimeZoneLabel(this.lastEdited()));

  private readonly requestedDifficulty = signal(this.route.snapshot.queryParamMap.get('difficulty') ?? this.data.lastDifficulty());
  readonly specId = signal<number | undefined>(undefined);
  private readonly bossSlug = signal<string | undefined>(undefined);

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

  /** Every character's talents on every boss of the difficulty, for every spec. */
  private readonly samples = computed(() => talentSamples(this.kills()));
  /** The bosses with kills on the difficulty; a boss without any can't be picked. */
  readonly bossesWithKills = computed(() => new Set(this.kills().map(kill => kill.boss)));

  // --- Every spec ---

  readonly specGroups = computed(() => {
    const boss = this.boss();
    const samples = boss ? this.samples().filter(sample => sample.boss === boss) : this.samples();
    const cards = specTalentSummaries(samples, this.specs(), this.talentTable()).map((summary): SpecCard => {
      const className = CLASS_NAMES[summary.spec.classId] ?? 'Unknown';
      return {
        ...summary,
        className,
        color: this.classColor(summary.spec.classId),
        label: agreementLabel(summary.agreement),
        consensus: summary.picks.tiers.map(tier => ({ talent: tier.leader?.talent, share: tier.leader?.share ?? 0, level: tier.level }))
      };
    });
    return ROLE_GROUPS.map(group => ({ ...group, cards: cards.filter(card => card.spec.role === group.role) }));
  });

  readonly highlights = computed<Highlight[]>(() => {
    const cards = this.specGroups().flatMap(group => group.cards).filter(card => card.picks.characters >= 20);
    if (!cards.length) {
      return [];
    }

    const settled = cards.reduce((best, card) => card.agreement > best.agreement ? card : best);
    const open = cards.reduce((best, card) => card.agreement < best.agreement ? card : best);
    const highlights: Highlight[] = [
      {
        label: 'Most settled',
        ...this.cardIdentity(settled),
        title: `${formatShare(settled.agreement)} agreement`,
        text: `${settled.spec.name} ${settled.className}s mostly play the same talents: the most played build alone is ${formatShare(settled.topBuild?.share ?? 0)} of them.`
      },
      {
        label: 'Most open',
        ...this.cardIdentity(open),
        title: `${formatShare(open.agreement)} agreement`,
        text: `${open.spec.name} ${open.className}s disagree the most: ${open.buildCount.toLocaleString('en-US')} different builds, and the most played is only ${formatShare(open.topBuild?.share ?? 0)} of them.`
      }
    ];

    // The biggest gap between what the best players pick and what everyone picks, any spec. A
    // spec with a handful of top players would win it on chance, so it needs EDGE_MIN_TOP_PICKS
    // when any spec has them.
    const edgesFrom = (minimum: number) => cards.flatMap(card => {
      const edge = card.picks.topPicks >= minimum ? topPlayerEdge(card.picks, 'more') : undefined;
      return edge ? [{ card, edge }] : [];
    });
    const strong = edgesFrom(EDGE_MIN_TOP_PICKS);
    const edges = strong.length ? strong : edgesFrom(NOTABLE_MIN_PICKS);
    if (edges.length) {
      const { card, edge } = edges.reduce((best, entry) => entry.edge.difference > best.edge.difference ? entry : best);
      highlights.push({
        label: 'Biggest top-player edge',
        ...this.cardIdentity(card),
        title: edge.choice.talent?.name ?? 'A talent',
        text: `${formatShare(edge.choice.topShare)} of the top 10% of ${card.spec.name} ${card.className}s take it, against ${formatShare(edge.choice.share)} of everyone.`
      });
    }
    return highlights;
  });

  // --- One spec ---

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
        icon: favoured.choice.talent?.icon,
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
        icon: avoided.choice.talent?.icon,
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
        icon: contested.leader.talent?.icon,
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
        icon: settled.leader.talent?.icon,
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
        icon: talent?.icon,
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

  readonly specOptions = computed<FilterDropdownOption[]>(() => [
    { value: undefined, label: 'All specs' },
    ...this.specs().map(spec => ({
      value: spec.id,
      label: `${spec.name} ${CLASS_NAMES[spec.classId] ?? ''}`.trim(),
      icon: spec.icon,
      color: this.classColor(spec.classId)
    }))
  ]);

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

    // Picking a spec is a navigation (it can be gone back from); the router hands every one,
    // the first included, to these signals. Difficulty and boss changes only rewrite the address.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.specId.set(parseNumber(params.get('spec')));
        this.bossSlug.set(params.get('boss') ?? undefined);
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

  setSpec(value: FilterDropdownValue): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: this.queryParams(typeof value === 'number' ? value : undefined) });
  }

  /** The query string of this view with the given spec; undefined for every spec. */
  queryParams(specId: number | undefined): Record<string, string | number | null> {
    return {
      difficulty: this.difficulty()?.slug ?? null,
      boss: this.boss()?.slug ?? null,
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

  private cardIdentity(card: SpecCard): Pick<Highlight, 'spec' | 'className' | 'color'> {
    return { spec: card.spec, className: card.className, color: card.color };
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
        },
        error: error => {
          console.error('Failed to load the raid rosters:', error);
          this.killsError.set(`The ${difficulty.name} raid rosters could not be loaded.`);
          this.killsLoading.set(false);
        }
      });
  }

  /** Difficulty and boss keep the scroll position: no navigation, only the address bar changes. */
  private writeUrl(): void {
    const url = this.router.createUrlTree([], { relativeTo: this.route, queryParams: this.queryParams(this.specId()) });
    this.location.replaceState(this.router.serializeUrl(url));
  }
}

function parseNumber(value: string | null): number | undefined {
  const number = value === null ? NaN : Number(value);
  return Number.isInteger(number) ? number : undefined;
}
