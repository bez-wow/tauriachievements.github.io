import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import competenceOptionalAnalysis from '../guild-analysis/competence-optional.json';
import endlessAnalysis from '../guild-analysis/endless.json';
import endlessMainAlts from '../guild-analysis/endless-main-alts.json';
import outlawsAnalysis from '../guild-analysis/outlaws.json';
import sixSevenAnalysis from '../guild-analysis/six-seven.json';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { formatPlayedTime } from './played-time';
import { UpdateBarComponent } from './update-bar.component';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';

interface GuildAnalysisPlayer {
  name: string;
  race: number;
  gender: number;
  class: number;
  guildRank?: number | null;
  guildRankName?: string | null;
  specialization?: string | null;
  playedTime: number;
  achievementPoints: number;
  artifactRelics: number;
  artifactTraits: number;
  itemLevel: number;
  legendaries?: GuildAnalysisLegendary[];
}

interface GuildAnalysisLegendary {
  id: number;
  name: string;
  icon: string;
  tooltipHtml?: string;
}

interface GuildAnalysis {
  timestamp: string;
  guild?: GuildAnalysisMetadata;
  ranks?: GuildAnalysisRank[];
  players: GuildAnalysisPlayer[];
}

interface GuildAnalysisRank {
  order: number;
  name: string;
}

interface GuildAnalysisMetadata {
  name: string;
  realm: string;
  faction: 'Alliance' | 'Horde' | 'Unknown';
}

type GuildAnalysisKey = 'endless' | 'competence-optional' | 'outlaws' | 'six-seven';

interface GuildAnalysisConfig {
  name: string;
  realm: string;
  analysis: GuildAnalysis;
}

const GUILD_ANALYSES: Readonly<Record<GuildAnalysisKey, GuildAnalysisConfig>> = {
  'endless': {
    name: 'Endless',
    realm: 'Evermoon',
    analysis: endlessAnalysis as GuildAnalysis
  },
  'competence-optional': {
    name: 'Competence Optional',
    realm: 'Evermoon',
    analysis: competenceOptionalAnalysis as GuildAnalysis
  },
  'outlaws': {
    name: 'Outlaws',
    realm: 'Tauri',
    analysis: outlawsAnalysis as GuildAnalysis
  },
  'six-seven': {
    name: 'Six Seven',
    realm: 'Evermoon',
    analysis: sixSevenAnalysis as GuildAnalysis
  }
};

interface ClassCountEntry {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

interface AltCharacterDefinition {
  name: string;
  wantsToRaid?: boolean;
}

type AltCharacterEntry = string | AltCharacterDefinition;
type MainAltCharacters = Readonly<Record<string, readonly AltCharacterEntry[]>>;
type CharacterRole = 'main' | 'alt' | 'unknown';
type CombatRole = 'Tank' | 'Heal' | 'Ranged' | 'Melee';

const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

const CLASS_COLORS: Readonly<Record<number, string>> = {
  1: '#c79c6e',
  2: '#f58cba',
  3: '#abd473',
  4: '#fff569',
  5: '#ffffff',
  6: '#c41f3b',
  7: '#0070de',
  8: '#69ccf0',
  9: '#9482c9',
  10: '#00ff96',
  11: '#ff7d0a',
  12: '#a330c9'
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
  | 'artifactRelics'
  | 'artifactTraits'
  | 'itemLevel'
  | 'playedTime'
  | 'achievementPoints';

type SortDirection = 'asc' | 'desc';

const SORT_COLUMNS = new Set<SortColumn>([
  'name',
  'guildRankName',
  'artifactRelics',
  'artifactTraits',
  'itemLevel',
  'playedTime',
  'achievementPoints'
]);

@Component({
  selector: 'app-endless6531-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, FilterDropdownComponent],
  providers: [FilterDropdownCoordinatorService],
  templateUrl: './endless6531-page.component.html',
  styleUrls: ['./endless6531-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Endless6531PageComponent {
  private readonly guildKey =
    inject(ActivatedRoute).snapshot.data['guild'] as GuildAnalysisKey ?? 'endless';
  private readonly guild = GUILD_ANALYSES[this.guildKey] ?? GUILD_ANALYSES.endless;
  private readonly analysis = this.guild.analysis;
  private readonly sourcePlayers = this.analysis.players;
  private readonly guildRankOrderByName = new Map(
    (this.analysis.ranks ?? []).map((rank) => [
      rank.name.trim().toLocaleLowerCase(),
      rank.order
    ])
  );

  readonly guildName = this.analysis.guild?.name ?? this.guild.name;
  readonly realmName = this.analysis.guild?.realm ?? this.guild.realm;
  readonly factionName = this.analysis.guild?.faction;
  readonly players = signal<GuildAnalysisPlayer[]>([]);
  readonly lastEdited = this.parseTimestamp(this.analysis.timestamp);
  readonly lastEditedTimeZoneLabel = this.analysis.timestamp.trim().split(/\s+/).at(-1) ?? 'Local time';
  readonly lastEditedTimeZone = this.timeZoneOffset(this.lastEditedTimeZoneLabel);
  readonly sortColumn = signal<SortColumn>('artifactTraits');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly getClassIconPath = getClassIconPath;
  readonly showMainAltCharacters = this.guildKey === 'endless';
  readonly mainCharacters = Object.entries(endlessMainAlts as MainAltCharacters)
    .filter(([, entries]) =>
      entries.some((entry) => this.altCharacterName(entry).trim().length > 0)
    )
    .map(([mainCharacter]) => mainCharacter)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  readonly selectedMainCharacter = signal('');
  readonly selectedAltCharacters = signal<readonly string[]>([]);
  readonly selectedClassId = signal<number | null>(null);
  readonly selectedCharacterRole = signal<CharacterRole | 'all'>('all');
  readonly selectedGuildRank = signal('');
  readonly selectedCombatRole = signal<CombatRole | ''>('');
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
  readonly raidCharacters = signal<ReadonlySet<string>>(new Set());
  private readonly characterRoles = this.buildCharacterRoles();
  private readonly mainCharactersByAlt = this.buildMainCharactersByAlt();

  readonly classCounts = this.buildClassCounts();
  readonly classFilterOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
    { value: undefined, label: 'All Classes' },
    ...this.classCounts
      .map((entry) => ({
        value: entry.id,
        label: entry.name,
        icon: getClassIconPath(entry.id),
        color: CLASS_COLORS[entry.id] ?? '#ffffff'
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ];

  constructor() {
    this.applySort();
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
    return CLASS_COLORS[classId] ?? '#ffffff';
  }

  armoryUrl(player: Pick<GuildAnalysisPlayer, 'name'>): string {
    return getArmoryUrl(player.name, this.realmName);
  }

  formatPlayedTime(seconds: number): string {
    return formatPlayedTime(seconds);
  }

  selectMainCharacter(name: string): void {
    const entries = (endlessMainAlts as MainAltCharacters)[name] ?? [];

    this.selectedMainCharacter.set(name);
    this.selectedAltCharacters.set(entries.map((entry) => this.altCharacterName(entry)));
    this.raidCharacters.set(new Set(
      entries
        .filter((entry): entry is AltCharacterDefinition =>
          typeof entry !== 'string' && entry.wantsToRaid === true
        )
        .map((entry) => entry.name.toLocaleLowerCase())
    ));
    this.applySort();
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
  }

  hideLegendaryTooltip(tooltip: HTMLElement): void {
    tooltip.classList.remove(
      'legendary-tooltip--measuring',
      'legendary-tooltip--visible'
    );
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

  selectCharacterRole(role: string): void {
    this.selectedCharacterRole.set(
      role === 'main' || role === 'alt' || role === 'unknown' ? role : 'all'
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
    this.selectedMainCharacter.set('');
    this.selectedAltCharacters.set([]);
    this.selectedClassId.set(null);
    this.selectedCharacterRole.set('all');
    this.selectedGuildRank.set('');
    this.selectedCombatRole.set('');
    this.raidCharacters.set(new Set());
    this.sortColumn.set('artifactTraits');
    this.sortDirection.set('desc');
    this.applySort();
  }

  wantsToRaid(player: GuildAnalysisPlayer): boolean {
    return this.raidCharacters().has(player.name.toLocaleLowerCase());
  }

  isSelectedMainCharacter(player: GuildAnalysisPlayer): boolean {
    return player.name.localeCompare(
      this.selectedMainCharacter(),
      undefined,
      { sensitivity: 'base' }
    ) === 0;
  }

  characterRole(player: GuildAnalysisPlayer): CharacterRole {
    return this.characterRoles.get(player.name.toLocaleLowerCase()) ?? 'unknown';
  }

  mainCharacterFor(player: GuildAnalysisPlayer): string | undefined {
    return this.mainCharactersByAlt.get(player.name.toLocaleLowerCase());
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

  private applySort(): void {
    const column = this.sortColumn();
    const multiplier = this.sortDirection() === 'asc' ? 1 : -1;
    const selectedAltNames = new Set(
      this.selectedAltCharacters().map((name) => name.toLocaleLowerCase())
    );
    const characterFilteredPlayers = this.selectedMainCharacter()
      ? this.sourcePlayers.filter((player) =>
          this.isSelectedMainCharacter(player)
          || selectedAltNames.has(player.name.toLocaleLowerCase())
        )
      : this.sourcePlayers;
    const classFilteredPlayers = this.selectedClassId() === null
      ? characterFilteredPlayers
      : characterFilteredPlayers.filter((player) => player.class === this.selectedClassId());
    const roleFilteredPlayers = this.selectedCharacterRole() === 'all'
      ? classFilteredPlayers
      : classFilteredPlayers.filter((player) => this.characterRole(player) === this.selectedCharacterRole());
    const rankFilteredPlayers = this.selectedGuildRank()
      ? roleFilteredPlayers.filter((player) =>
          player.guildRankName?.localeCompare(
            this.selectedGuildRank(),
            undefined,
            { sensitivity: 'base' }
          ) === 0
        )
      : roleFilteredPlayers;
    const visiblePlayers = this.selectedCombatRole()
      ? rankFilteredPlayers.filter((player) =>
          this.combatRole(player) === this.selectedCombatRole()
        )
      : rankFilteredPlayers;

    this.players.set([...visiblePlayers].sort((left, right) => {
      if (this.selectedMainCharacter()) {
        const leftIsMain = this.isSelectedMainCharacter(left);
        const rightIsMain = this.isSelectedMainCharacter(right);

        if (leftIsMain !== rightIsMain) {
          return leftIsMain ? -1 : 1;
        }
      }

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
        return player[column];
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

  private altCharacterName(entry: AltCharacterEntry): string {
    return typeof entry === 'string' ? entry : entry.name;
  }

  private buildCharacterRoles(): ReadonlyMap<string, CharacterRole> {
    const roles = new Map<string, CharacterRole>();
    const mainAlts = endlessMainAlts as MainAltCharacters;

    for (const entries of Object.values(mainAlts)) {
      for (const entry of entries) {
        const altName = this.altCharacterName(entry).trim();
        if (altName) {
          roles.set(altName.toLocaleLowerCase(), 'alt');
        }
      }
    }

    // A character defined as a main always takes precedence if it also appears
    // in another character's alt list.
    for (const mainCharacter of Object.keys(mainAlts)) {
      roles.set(mainCharacter.toLocaleLowerCase(), 'main');
    }

    return roles;
  }

  private buildMainCharactersByAlt(): ReadonlyMap<string, string> {
    const mainCharactersByAlt = new Map<string, string>();
    const mainAlts = endlessMainAlts as MainAltCharacters;

    for (const [mainCharacter, entries] of Object.entries(mainAlts)) {
      for (const entry of entries) {
        const altName = this.altCharacterName(entry).trim();
        if (altName && !mainCharactersByAlt.has(altName.toLocaleLowerCase())) {
          mainCharactersByAlt.set(altName.toLocaleLowerCase(), mainCharacter);
        }
      }
    }

    return mainCharactersByAlt;
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
