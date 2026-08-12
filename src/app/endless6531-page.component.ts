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

interface GuildAnalysisPlayer {
  name: string;
  race: number;
  gender: number;
  class: number;
  guildRankName?: string | null;
  specialization?: string | null;
  playedTime: number;
  achievementPoints: number;
  artifactRelics: number;
  artifactTraits: number;
  itemLevel: number;
}

interface GuildAnalysis {
  timestamp: string;
  players: GuildAnalysisPlayer[];
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

const GUILD_RANK_ORDER = [
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
  const rankIndex = GUILD_RANK_ORDER.findIndex(
    (rank) => rank.toLocaleLowerCase() === normalizedRankName
  );

  return rankIndex === -1 ? GUILD_RANK_ORDER.length : rankIndex;
}

type SortColumn =
  | 'name'
  | 'raceClass'
  | 'guildRankName'
  | 'specialization'
  | 'artifactRelics'
  | 'artifactTraits'
  | 'itemLevel'
  | 'playedTime'
  | 'achievementPoints';

type SortDirection = 'asc' | 'desc';

const SORT_COLUMNS = new Set<SortColumn>([
  'name',
  'raceClass',
  'guildRankName',
  'specialization',
  'artifactRelics',
  'artifactTraits',
  'itemLevel',
  'playedTime',
  'achievementPoints'
]);

@Component({
  selector: 'app-endless6531-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent],
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

  readonly guildName = this.guild.name;
  readonly realmName = this.guild.realm;
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
  readonly guildRanks = [...new Set(
    this.sourcePlayers
      .map((player) => player.guildRankName?.trim())
      .filter((rank): rank is string => Boolean(rank))
  )].sort((left, right) => {
    const leftIndex = guildRankOrderIndex(left);
    const rightIndex = guildRankOrderIndex(right);

    if (leftIndex !== GUILD_RANK_ORDER.length || rightIndex !== GUILD_RANK_ORDER.length) {
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right, undefined, { sensitivity: 'base' });
  });
  readonly raidCharacters = signal<ReadonlySet<string>>(new Set());
  private readonly characterRoles = this.buildCharacterRoles();
  private readonly mainCharactersByAlt = this.buildMainCharactersByAlt();

  readonly classCounts = this.buildClassCounts();

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
        || column === 'raceClass'
        || column === 'guildRankName'
        || column === 'specialization'
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
      || selectedColumn === 'raceClass'
      || selectedColumn === 'guildRankName'
      || selectedColumn === 'specialization'
        ? 'asc'
        : 'desc'
    );
    this.applySort();
  }

  toggleSortDirection(): void {
    this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    this.applySort();
  }

  sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) {
      return '';
    }

    return this.sortDirection() === 'asc' ? '▲' : '▼';
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

  selectClass(classId: string): void {
    const parsedClassId = Number(classId);
    this.selectedClassId.set(
      classId && Number.isInteger(parsedClassId) ? parsedClassId : null
    );
    this.applySort();
  }

  selectCharacterRole(role: string): void {
    this.selectedCharacterRole.set(
      role === 'main' || role === 'alt' || role === 'unknown' ? role : 'all'
    );
    this.applySort();
  }

  selectGuildRank(rank: string): void {
    this.selectedGuildRank.set(rank);
    this.applySort();
  }

  selectCombatRole(role: string): void {
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
      counts.set(player.class, (counts.get(player.class) ?? 0) + 1);
    }

    const largestClassCount = Math.max(0, ...counts.values());
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        name: CLASS_NAMES[id] ?? `Class ${id}`,
        count,
        percentage: largestClassCount === 0 ? 0 : count / largestClassCount * 100
      }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
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
      case 'raceClass':
        return player.race * 100 + player.class;
      case 'guildRankName':
        if (!player.guildRankName) {
          return null;
        }

        return guildRankOrderIndex(player.guildRankName);
      case 'specialization':
        return player[column] ?? null;
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
