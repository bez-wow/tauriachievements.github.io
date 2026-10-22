import { DecimalPipe } from '@angular/common';
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
  GuildAnalysis,
  GuildAnalysisPlayer,
  GuildPage
} from './guild-analysis';
import { getArmoryUrl } from '../../game/armory';
import { getClassIconPath } from '../../game/classIconHelper';
import {
  CombatRole,
  SortColumn,
  SortDirection,
  countClasses,
  defaultSortDirection,
  guildRankNames,
  guildRankOrder,
  isSortColumn,
  legendaryTooltipHtml,
  legendaryUrl,
  parseGuildTimestamp,
  rosterRows,
  timeZoneLabelOf,
  timeZoneOffset
} from './guild-roster';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { ArtifactSpecTraits, artifactSpecTraits } from './guild-artifact-specs';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { getClassColor } from '../../game/class-colors';
import { injectCompactViewport } from '../../shared/compact-viewport';
import { MobileFilterToggleComponent } from '../../shared/mobile-filter-toggle.component';
import { TapTooltipDirective } from '../../shared/tap-tooltip.directive';
import { setPageHeader } from '../../core/page-header';

const MOBILE_ROSTER_PAGE_SIZE = 25;

@Component({
  selector: 'app-guild-analysis-page',
  imports: [
    FilterDropdownComponent,
    MobileFilterToggleComponent,
    TapTooltipDirective,
    DecimalPipe
  ],
  providers: [FilterDropdownCoordinatorService],
  templateUrl: './guild-analysis-page.component.html',
  styleUrls: ['./guild-analysis-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GuildAnalysisPageComponent {
  private activeLegendaryTooltip: HTMLElement | null = null;

  private readonly routeData = inject(ActivatedRoute).snapshot.data;
  private readonly guild = this.routeData['guild'] as GuildPage;
  private readonly loadedAnalysis = this.routeData['analysis'] as GuildAnalysis | null | undefined;
  private readonly analysis: GuildAnalysis = this.loadedAnalysis ?? { timestamp: '', players: [] };
  private readonly sourcePlayers = this.analysis.players;
  private readonly specTraitsByPlayer = new Map(
    this.sourcePlayers.map((player) => [player.name, artifactSpecTraits(player)])
  );
  private readonly guildRankOrderByName = guildRankOrder(this.analysis.ranks ?? []);

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
  readonly lastEdited = parseGuildTimestamp(this.analysis.timestamp);
  readonly lastEditedTimeZoneLabel = timeZoneLabelOf(this.analysis.timestamp);
  readonly lastEditedTimeZone = timeZoneOffset(this.lastEditedTimeZoneLabel);
  readonly sortColumn = signal<SortColumn>('artifactTraits');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly getClassIconPath = getClassIconPath;
  readonly selectedClassId = signal<number | null>(null);
  readonly selectedGuildRank = signal('');
  readonly selectedCombatRole = signal<CombatRole | ''>('');
  readonly filtersOpen = signal(false);
  readonly classBreakdownOpen = signal(false);
  readonly guildRanks = guildRankNames(this.sourcePlayers, this.analysis.ranks ?? []);
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

  readonly classCounts = countClasses(this.sourcePlayers);
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

  readonly isTableOverflowing = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tableScroll = viewChild<ElementRef<HTMLElement>>('tableScroll');

  constructor() {
    setPageHeader(() => ({ lastEdited: this.lastEdited, timeZone: this.lastEditedTimeZone, timeZoneLabel: this.lastEditedTimeZoneLabel }));
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
      this.sortDirection.set(defaultSortDirection(column));
    }

    this.applySort();
  }

  selectMobileSort(column: string): void {
    if (!isSortColumn(column)) {
      return;
    }

    this.sortColumn.set(column);
    this.sortDirection.set(defaultSortDirection(column));
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

  readonly legendaryUrl = legendaryUrl;
  readonly legendaryTooltipHtml = legendaryTooltipHtml;

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

  showMorePlayers(): void {
    this.mobileRosterLimit.update((limit) => limit + MOBILE_ROSTER_PAGE_SIZE);
  }

  showAllPlayers(): void {
    this.mobileRosterLimit.set(Number.POSITIVE_INFINITY);
  }

  private applySort(): void {
    this.mobileRosterLimit.set(MOBILE_ROSTER_PAGE_SIZE);
    this.players.set(rosterRows(
      this.sourcePlayers,
      { classId: this.selectedClassId(), guildRank: this.selectedGuildRank(), combatRole: this.selectedCombatRole() },
      this.sortColumn(),
      this.sortDirection(),
      this.guildRankOrderByName
    ));
  }
}
