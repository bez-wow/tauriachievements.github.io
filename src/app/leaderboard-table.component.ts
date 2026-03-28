import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { getGuildArmoryUrl, getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { HighlightPart, LadderPlayerView, LadderSort } from './ladder.types';

@Component({
  selector: 'app-leaderboard-table',
  templateUrl: './leaderboard-table.component.html',
  styleUrls: ['./leaderboard-table.component.scss'],
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LeaderboardTableComponent {
  @Input() players: LadderPlayerView[] = [];
  @Input() currentSort: LadderSort = 'achievementPoints';

  readonly getClassIconPath = getClassIconPath;
  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  trackPlayer(_index: number, player: LadderPlayerView): string {
    return `${player.realm}::${player.name}`;
  }

  trackHighlightPart(index: number, _part: HighlightPart): number {
    return index;
  }

  onImageError(event: Event) {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }
}
