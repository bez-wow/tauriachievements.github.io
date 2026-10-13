import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  DEFAULT_GUILD_ANALYSIS_KEY,
  GuildAnalysis,
  GuildAnalysisKey,
  GuildAnalysisLegendary,
  GuildAnalysisPlayer
} from './guild-analysis';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { ArtifactSpecTraits, artifactSpecTraits } from './guild-artifact-specs';
import { UpdateBarComponent } from './update-bar.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { getClassColor } from './class-colors';
import { injectCompactViewport } from './compact-viewport';
import { MobileFilterToggleComponent } from './mobile-filter-toggle.component';
import { TapTooltipDirective } from './tap-tooltip.directive';

/** On phones each member is a ~470 px tall card, so the roster is rendered this many at a time. */
const MOBILE_ROSTER_PAGE_SIZE = 25;

interface GuildAnalysisConfig {
  name: string;
  realm: string;
}

const GUILD_ANALYSES: Readonly<Record<GuildAnalysisKey, GuildAnalysisConfig>> = {
  'endless': {
    name: 'Endless',
    realm: 'Evermoon'
  },
  'competence-optional': {
    name: 'Competence Optional',
    realm: 'Evermoon'
  },
  'entropy': {
    name: 'Entropy',
    realm: 'Evermoon'
  },
  'impaired': {
    name: 'Impaired',
    realm: 'Evermoon'
  },
  'impact': {
    name: 'Impact',
    realm: 'Evermoon'
  },
  'miracle': {
    name: 'Miracle',
    realm: 'Evermoon'
  },
  'outlaws': {
    name: 'Outlaws',
    realm: 'Tauri'
  },
  'highly-regarded': {
    name: 'Highly Regarded',
    realm: 'Evermoon'
  },
  'temerite': {
    name: 'Témérité',
    realm: 'Evermoon'
  }
};

interface ClassCountEntry {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

type CombatRole = 'Tank' | 'Heal' | 'Ranged' | 'Melee';

const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

const LEGACY_GUILD_RANK_ORDER = [
  'Guild Master',
  'Officer',
  'Officer Alt',
  'Core',
  'Raider',
  'Trial',
  'Alt',
  'Family'
] as const;

function guildRankOrderIndex(rankName: string): number {
  const normalizedRankName = rankName.trim().toLocaleLowerCase();
  const rankIndex = LEGACY_GUILD_RANK_ORDER.findIndex(
    (rank) => rank.toLocaleLowerCase() === normalizedRankName
  );

  return rankIndex === -1 ? LEGACY_GUILD_RANK_ORDER.length : rankIndex;
}

type SortColumn =
  | 'name'
  | 'guildRankName'
  | 'artifactTraits'
  | 'artifactKnowledge'
  | 'itemLevel';

type SortDirection = 'asc' | 'desc';

const SORT_COLUMNS = new Set<SortColumn>([
  'name',
  'guildRankName',
  'artifactTraits',
  'artifactKnowledge',
  'itemLevel'
]);

@Component({
  selector: 'app-endless6531-page',
  standalone: true,
  imports: [
    CommonModule,
    UpdateBarComponent,
    FilterDropdownComponent,
    MobileFilterToggleComponent,
    TapTooltipDirective
  ],
  providers: [FilterDropdownCoordinatorService],
  templateUrl: './endless6531-page.component.html',
  styleUrls: ['./endless6531-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Endless6531PageComponent {
  private activeLegendaryTooltip: HTMLElement | null = null;

  private readonly routeData = inject(ActivatedRoute).snapshot.data;
  private readonly guildKey =
    this.routeData['guild'] as GuildAnalysisKey ?? DEFAULT_GUILD_ANALYSIS_KEY;
  private readonly guild = GUILD_ANALYSES[this.guildKey] ?? GUILD_ANALYSES[DEFAULT_GUILD_ANALYSIS_KEY];
  // Loaded by guildAnalysisResolver before the page is created; null when the load failed.
  private readonly loadedAnalysis = this.routeData['analysis'] as GuildAnalysis | null | undefined;
  private readonly analysis: GuildAnalysis = this.loadedAnalysis ?? { timestamp: '', players: [] };
  private readonly sourcePlayers = this.analysis.players;
  private readonly specTraitsByPlayer = new Map(
    this.sourcePlayers.map((player) => [player.name, artifactSpecTraits(player)])
  );
  private readonly guildRankOrderByName = new Map(
    (this.analysis.ranks ?? []).map((rank) => [
      rank.name.trim().toLocaleLowerCase(),
      rank.order
    ])
  );

  readonly guildName = this.analysis.guild?.name ?? this.guild.name;
  readonly realmName = this.analysis.guild?.realm ?? this.guild.realm;
  readonly factionName = this.analysis.guild?.faction;
  readonly loadFailed = !this.loadedAnalysis;
  readonly players = signal<GuildAnalysisPlayer[]>([]);
  private readonly isCompactViewport = injectCompactViewport();
  private readonly mobileRosterLimit = signal(MOBILE_ROSTER_PAGE_SIZE);
  readonly renderedPlayers = computed(() =>
    this.isCompactViewport() ? this.players().slice(0, this.mobileRosterLimit()) : this.players()
  );
  readonly hiddenPlayerCount = computed(() => this.players().length - this.renderedPlayers().length);
  readonly nextRosterPageSize = computed(() => Math.min(MOBILE_ROSTER_PAGE_SIZE, this.hiddenPlayerCount()));
  readonly lastEdited = this.parseTimestamp(this.analysis.timestamp);
  readonly lastEditedTimeZoneLabel = this.analysis.timestamp.trim().split(/\s+/).at(-1) || 'Local time';
  readonly lastEditedTimeZone = this.timeZoneOffset(this.lastEditedTimeZoneLabel);
  readonly sortColumn = signal<SortColumn>('artifactTraits');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly getClassIconPath = getClassIconPath;
  readonly selectedClassId = signal<number | null>(null);
  readonly selectedGuildRank = signal('');
  readonly selectedCombatRole = signal<CombatRole | ''>('');
  /** Phones collapse the filters and the class breakdown so the roster starts on the first screen. */
  readonly filtersOpen = signal(false);
  readonly classBreakdownOpen = signal(false);
  readonly guildRanks = this.buildGuildRanks();
  readonly guildRankFilterOptions: ReadonlyArray<FilterDropdownOption<string | undefined>> = [
    { value: undefined, label: 'All ranks' },
    ...this.guildRanks.map((rank) => ({ value: rank, label: rank }))
  ];
  readonly combatRoleFilterOptions: ReadonlyArray<FilterDropdownOption<string | undefined>> = [
    { value: undefined, label: 'All combat roles' },
    { value: 'Tank', label: 'Tank' },
    { value: 'Heal', label: 'Heal' },
    { value: 'Ranged', label: 'Ranged' },
    { value: 'Melee', label: 'Melee' }
  ];

  readonly classCounts = this.buildClassCounts();
  readonly classFilterOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
    { value: undefined, label: 'All Classes' },
    ...this.classCounts
      .map((entry) => ({
        value: entry.id,
        label: entry.name,
        icon: getClassIconPath(entry.id),
        color: getClassColor(entry.id) ?? '#ffffff'
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];

  /**
   * Whether the roster table is wider than its column (its cells don't wrap, so it needs about
   * 900 px). Only then does it scroll sideways: a scrolling container would also stop the
   * header from sticking to the page, which it can keep wherever the table fits.
   */
  readonly isTableOverflowing = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tableScroll = viewChild<ElementRef<HTMLElement>>('tableScroll');

  constructor() {
    this.applySort();
    afterNextRender(() => this.watchTableWidth());
  }

  private watchTableWidth(): void {
    const container = this.tableScroll()?.nativeElement;
    const table = container?.querySelector('table');
    if (!container || !table || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      this.isTableOverflowing.set(table.offsetWidth > container.clientWidth + 1);
    });
    observer.observe(container);
    observer.observe(table);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** The roster filters that differ from their defaults, for the phone filter summary. */
  activeFilterLabels(): string[] {
    const labels: string[] = [];

    if (this.selectedGuildRank()) {
      labels.push(this.selectedGuildRank());
    }
    const classEntry = this.classCounts.find((entry) => entry.id === this.selectedClassId());
    if (classEntry) {
      labels.push(classEntry.name);
    }
    if (this.selectedCombatRole()) {
      labels.push(this.selectedCombatRole());
    }
    return labels;
  }

  sortBy(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(
        column === 'name'
        || column === 'guildRankName'
          ? 'asc'
          : 'desc'
      );
    }

    this.applySort();
  }

  selectMobileSort(column: string): void {
    if (!SORT_COLUMNS.has(column as SortColumn)) {
      return;
    }

    const selectedColumn = column as SortColumn;
    this.sortColumn.set(selectedColumn);
    this.sortDirection.set(
      selectedColumn === 'name'
      || selectedColumn === 'guildRankName'
        ? 'asc'
        : 'desc'
    );
    this.applySort();
  }

  toggleSortDirection(): void {
    this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    this.applySort();
  }

  ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  raceIcon(player: GuildAnalysisPlayer): string {
    return getRaceIconPath(player.race, player.gender);
  }

  classColor(classId: number): string {
    return getClassColor(classId) ?? '#ffffff';
  }

  armoryUrl(player: Pick<GuildAnalysisPlayer, 'name'>): string {
    return getArmoryUrl(player.name, this.realmName);
  }

  specTraits(player: GuildAnalysisPlayer): ArtifactSpecTraits[] {
    return this.specTraitsByPlayer.get(player.name) ?? [];
  }

  legendaryUrl(item: Pick<GuildAnalysisLegendary, 'id'>): string {
    return `https://legion-shoot.tauri.hu/?item=${item.id}`;
  }

  legendaryTooltipHtml(tooltipHtml: string): string {
    return tooltipHtml
      .replace(/(?:&nbsp;)?<small\b[^>]*>.*?<\/small>/gis, '')
      .replace(
        /<br\s*\/?>\s*(?:<!--sockets-->)?\s*Durability[^<]*<br\s*\/?>/gi,
        '<br />'
      )
      .replace(/<br\s*\/?>\s*Requires Level[^<]*<br\s*\/?>/gi, '<br />')
      .replace(/<br\s*\/?>Sell Price:.*?(?=<\/td>)/is, '');
  }

  showLegendaryTooltip(
    event: MouseEvent | FocusEvent,
    tooltip: HTMLElement
  ): void {
    const anchor = event.currentTarget as HTMLElement | null;
    if (!anchor) {
      return;
    }

    if (this.activeLegendaryTooltip && this.activeLegendaryTooltip !== tooltip) {
      this.hideLegendaryTooltip(this.activeLegendaryTooltip);
    }

    const viewportPadding = 8;
    const anchorGap = 8;
    tooltip.classList.add('legendary-tooltip--measuring');

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const preferredTop = anchorRect.top - tooltipRect.height - anchorGap;
    const fallbackTop = anchorRect.bottom + anchorGap;
    const maximumTop = window.innerHeight - tooltipRect.height - viewportPadding;
    const top = preferredTop >= viewportPadding ? preferredTop : fallbackTop;
    const centeredLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    const maximumLeft = window.innerWidth - tooltipRect.width - viewportPadding;

    tooltip.style.top = `${Math.max(viewportPadding, Math.min(top, maximumTop))}px`;
    tooltip.style.left = `${Math.max(viewportPadding, Math.min(centeredLeft, maximumLeft))}px`;
    tooltip.classList.remove('legendary-tooltip--measuring');
    tooltip.classList.add('legendary-tooltip--visible');
    this.activeLegendaryTooltip = tooltip;
  }

  hideLegendaryTooltip(tooltip: HTMLElement): void {
    tooltip.classList.remove(
      'legendary-tooltip--measuring',
      'legendary-tooltip--visible'
    );

    if (this.activeLegendaryTooltip === tooltip) {
      this.activeLegendaryTooltip = null;
    }
  }

  @HostListener('window:scroll')
  hideLegendaryTooltipOnScroll(): void {
    if (this.activeLegendaryTooltip) {
      this.hideLegendaryTooltip(this.activeLegendaryTooltip);
    }
  }

  selectClass(classId: FilterDropdownValue): void {
    const parsedClassId = Number(classId);
    this.selectedClassId.set(
      classId !== undefined && classId !== '' && Number.isInteger(parsedClassId)
        ? parsedClassId
        : null
    );
    this.applySort();
  }

  selectGuildRank(rank: FilterDropdownValue): void {
    this.selectedGuildRank.set(typeof rank === 'string' ? rank : '');
    this.applySort();
  }

  selectCombatRole(role: FilterDropdownValue): void {
    this.selectedCombatRole.set(
      role === 'Tank' || role === 'Heal' || role === 'Ranged' || role === 'Melee'
        ? role
        : ''
    );
    this.applySort();
  }

  resetFilters(): void {
    this.selectedClassId.set(null);
    this.selectedGuildRank.set('');
    this.selectedCombatRole.set('');
    this.sortColumn.set('artifactTraits');
    this.sortDirection.set('desc');
    this.applySort();
  }

  trackPlayer(_index: number, player: GuildAnalysisPlayer): string {
    return player.name;
  }

  private buildClassCounts(): ClassCountEntry[] {
    const counts = new Map<number, number>();

    for (const player of this.sourcePlayers) {
      if (!CLASS_NAMES[player.class]) {
        continue;
      }

      counts.set(player.class, (counts.get(player.class) ?? 0) + 1);
    }

    const largestClassCount = Math.max(0, ...counts.values());
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name: CLASS_NAMES[id],
        count,
        percentage: largestClassCount === 0 ? 0 : count / largestClassCount * 100
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }

  private buildGuildRanks(): string[] {
    const playerRankNames = [...new Set(
      this.sourcePlayers
        .map((player) => player.guildRankName?.trim())
        .filter((rank): rank is string => Boolean(rank))
    )];
    const playerRankNamesByKey = new Map(
      playerRankNames.map((rank) => [rank.toLocaleLowerCase(), rank])
    );
    const exportedRanks = (this.analysis.ranks ?? [])
      .filter((rank) => rank.name.trim().length > 0)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
      .map((rank) => playerRankNamesByKey.get(rank.name.trim().toLocaleLowerCase()) ?? rank.name.trim());
    const exportedRankKeys = new Set(exportedRanks.map((rank) => rank.toLocaleLowerCase()));
    const unlistedPlayerRanks = playerRankNames
      .filter((rank) => !exportedRankKeys.has(rank.toLocaleLowerCase()))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    if (exportedRanks.length > 0) {
      return [...exportedRanks, ...unlistedPlayerRanks];
    }

    return playerRankNames.sort((left, right) => {
      const leftIndex = guildRankOrderIndex(left);
      const rightIndex = guildRankOrderIndex(right);
      return leftIndex - rightIndex
        || left.localeCompare(right, undefined, { sensitivity: 'base' });
    });
  }

  showMorePlayers(): void {
    this.mobileRosterLimit.update((limit) => limit + MOBILE_ROSTER_PAGE_SIZE);
  }

  showAllPlayers(): void {
    this.mobileRosterLimit.set(Number.POSITIVE_INFINITY);
  }

  private applySort(): void {
    this.mobileRosterLimit.set(MOBILE_ROSTER_PAGE_SIZE);
    const column = this.sortColumn();
    const multiplier = this.sortDirection() === 'asc' ? 1 : -1;
    const classFilteredPlayers = this.selectedClassId() === null
      ? this.sourcePlayers
      : this.sourcePlayers.filter((player) => player.class === this.selectedClassId());
    const rankFilteredPlayers = this.selectedGuildRank()
      ? classFilteredPlayers.filter((player) =>
          player.guildRankName?.localeCompare(
            this.selectedGuildRank(),
            undefined,
            { sensitivity: 'base' }
          ) === 0
        )
      : classFilteredPlayers;
    const visiblePlayers = this.selectedCombatRole()
      ? rankFilteredPlayers.filter((player) =>
          this.combatRole(player) === this.selectedCombatRole()
        )
      : rankFilteredPlayers;

    this.players.set([...visiblePlayers].sort((left, right) => {
      const leftValue = this.sortValue(left, column);
      const rightValue = this.sortValue(right, column);

      if (leftValue === null && rightValue === null) {
        return left.name.localeCompare(right.name);
      }
      if (leftValue === null) {
        return 1;
      }
      if (rightValue === null) {
        return -1;
      }

      const comparison = typeof leftValue === 'string'
        ? leftValue.localeCompare(rightValue as string, undefined, { sensitivity: 'base' })
        : leftValue - (rightValue as number);

      return comparison === 0 ? left.name.localeCompare(right.name) : comparison * multiplier;
    }));
  }

  private sortValue(player: GuildAnalysisPlayer, column: SortColumn): string | number | null {
    switch (column) {
      case 'name':
        return player.name;
      case 'guildRankName':
        if (Number.isInteger(player.guildRank)) {
          return player.guildRank as number;
        }

        if (!player.guildRankName) {
          return null;
        }

        return this.guildRankOrderByName.get(
          player.guildRankName.trim().toLocaleLowerCase()
        ) ?? guildRankOrderIndex(player.guildRankName);
      default:
        return player[column] ?? null;
    }
  }

  private combatRole(player: GuildAnalysisPlayer): CombatRole | undefined {
    const specialization = player.specialization?.trim();
    if (!specialization) {
      return undefined;
    }

    switch (player.class) {
      case 1:
        return specialization === 'Protection' ? 'Tank' : 'Melee';
      case 2:
        return specialization === 'Protection' ? 'Tank'
          : specialization === 'Holy' ? 'Heal'
          : 'Melee';
      case 3:
        return specialization === 'Survival' ? 'Melee' : 'Ranged';
      case 4:
        return 'Melee';
      case 5:
        return specialization === 'Shadow' ? 'Ranged' : 'Heal';
      case 6:
        return specialization === 'Blood' ? 'Tank' : 'Melee';
      case 7:
        return specialization === 'Restoration' ? 'Heal'
          : specialization === 'Elemental' ? 'Ranged'
          : 'Melee';
      case 8:
      case 9:
        return 'Ranged';
      case 10:
        return specialization === 'Brewmaster' ? 'Tank'
          : specialization === 'Mistweaver' ? 'Heal'
          : 'Melee';
      case 11:
        return specialization === 'Guardian' ? 'Tank'
          : specialization === 'Restoration' ? 'Heal'
          : specialization === 'Balance' ? 'Ranged'
          : 'Melee';
      case 12:
        return specialization === 'Vengeance' ? 'Tank' : 'Melee';
      default:
        return undefined;
    }
  }

  private parseTimestamp(timestamp: string): Date | undefined {
    const match = timestamp.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s+(CET|CEST|UTC)$/
    );
    if (!match) {
      return undefined;
    }

    const [, year, month, day, hour, minute, second, zone] = match;
    const offset = zone === 'CEST' ? '+02:00' : zone === 'CET' ? '+01:00' : '+00:00';
    const parsedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  private timeZoneOffset(timeZoneLabel: string): string | undefined {
    return timeZoneLabel === 'CEST' ? '+0200'
      : timeZoneLabel === 'CET' ? '+0100'
      : timeZoneLabel === 'UTC' ? '+0000'
      : undefined;
  }
}
