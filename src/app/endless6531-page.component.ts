import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import endlessPlayers from '../assets/endless6531.json';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { formatPlayedTime } from './played-time';
import { UpdateBarComponent } from './update-bar.component';

interface EndlessPlayer {
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

@Component({
  selector: 'app-endless6531-page',
  standalone: true,
  imports: [CommonModule, UpdateBarComponent],
  templateUrl: './endless6531-page.component.html',
  styleUrls: ['./endless6531-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Endless6531PageComponent {
  private readonly sourcePlayers = endlessPlayers as EndlessPlayer[];

  readonly players = signal<EndlessPlayer[]>([]);
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

  raceIcon(player: EndlessPlayer): string {
    return getRaceIconPath(player.race, player.gender);
  }

  armoryUrl(player: EndlessPlayer): string {
    return getArmoryUrl(player.name, 'Evermoon');
  }

  formatPlayedTime(seconds: number): string {
    return formatPlayedTime(seconds);
  }

  formatReputation(player: EndlessPlayer): string {
    if (player.nightfallenReputation === null || player.nightfallenReputationMaximum === null) {
      return '—';
    }

    return `${player.nightfallenReputation.toLocaleString()} / ${player.nightfallenReputationMaximum.toLocaleString()}`;
  }

  trackPlayer(_index: number, player: EndlessPlayer): string {
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

  private sortValue(player: EndlessPlayer, column: SortColumn): string | number | null {
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
}
