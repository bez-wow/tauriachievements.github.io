import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import competenceOptionalAnalysis from '../guild-analysis/competence-optional.json';
import endlessAnalysis from '../guild-analysis/endless.json';
import outlawsAnalysis from '../guild-analysis/outlaws.json';
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
  playedTime: number;
  achievementPoints: number;
  nightfallenReputation: number | null;
  nightfallenReputationMaximum: number | null;
  artifactRelics: number;
  artifactTraits: number;
  itemLevel: number;
}

interface GuildAnalysis {
  timestamp: string;
  players: GuildAnalysisPlayer[];
}

type GuildAnalysisKey = 'endless' | 'competence-optional' | 'outlaws';

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
  }
};

interface ClassCountEntry {
  id: number;
  name: string;
  count: number;
  percentage: number;
}

const CLASS_NAMES: Readonly<Record<number, string>> = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid', 12: 'Demon Hunter'
};

type SortColumn =
  | 'name'
  | 'raceClass'
  | 'reputation'
  | 'artifactRelics'
  | 'artifactTraits'
  | 'itemLevel'
  | 'playedTime'
  | 'achievementPoints';

type SortDirection = 'asc' | 'desc';

const SORT_COLUMNS = new Set<SortColumn>([
  'name',
  'raceClass',
  'reputation',
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

  readonly classCounts = this.buildClassCounts();

  constructor() {
    this.applySort();
  }

  sortBy(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'name' || column === 'raceClass' ? 'asc' : 'desc');
    }

    this.applySort();
  }

  selectMobileSort(column: string): void {
    if (!SORT_COLUMNS.has(column as SortColumn)) {
      return;
    }

    const selectedColumn = column as SortColumn;
    this.sortColumn.set(selectedColumn);
    this.sortDirection.set(selectedColumn === 'name' || selectedColumn === 'raceClass' ? 'asc' : 'desc');
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

  armoryUrl(player: GuildAnalysisPlayer): string {
    return getArmoryUrl(player.name, this.realmName);
  }

  formatPlayedTime(seconds: number): string {
    return formatPlayedTime(seconds);
  }

  formatReputation(player: GuildAnalysisPlayer): string {
    if (player.nightfallenReputation === null || player.nightfallenReputationMaximum === null) {
      return '—';
    }

    return `${player.nightfallenReputation.toLocaleString()} / ${player.nightfallenReputationMaximum.toLocaleString()}`;
  }

  isHighReputation(player: GuildAnalysisPlayer): boolean {
    return player.nightfallenReputationMaximum === 21_000
      || (
        player.nightfallenReputationMaximum === 12_000
        && player.nightfallenReputation !== null
        && player.nightfallenReputation >= 8_000
      );
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

    this.players.set([...this.sourcePlayers].sort((left, right) => {
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
      case 'reputation':
        return player.nightfallenReputation === null || player.nightfallenReputationMaximum === null
          ? null
          : player.nightfallenReputationMaximum * 1_000_000 + player.nightfallenReputation;
      default:
        return player[column];
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
