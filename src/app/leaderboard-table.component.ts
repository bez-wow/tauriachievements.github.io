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

  showAchievementProgress(player: LadderPlayerView): boolean {
    return this.currentSort === 'achievementPoints'
      && (player.achievementPointsDelta !== 0 || player.achievementRankDelta !== 0);
  }

  showAchievementDelta(player: LadderPlayerView): boolean {
    return player.achievementPointsDelta !== 0;
  }

  showAchievementRank(player: LadderPlayerView): boolean {
    return this.currentSort === 'achievementPoints' && player.achievementRankDelta !== 0;
  }

  showHonorableKillProgress(player: LadderPlayerView): boolean {
    return this.currentSort === 'honorableKills'
      && (player.honorableKillsDelta !== 0 || player.honorableKillsRankDelta !== 0);
  }

  showHonorableKillDelta(player: LadderPlayerView): boolean {
    return player.honorableKillsDelta !== 0;
  }

  showHonorableKillRank(player: LadderPlayerView): boolean {
    return this.currentSort === 'honorableKills' && player.honorableKillsRankDelta !== 0;
  }

  showAppearanceDelta(player: LadderPlayerView): boolean {
    return player.appearanceCountDelta !== 0;
  }

  showAppearanceRank(player: LadderPlayerView): boolean {
    return this.currentSort === 'appearanceCount' && player.appearanceRankDelta !== 0;
  }

  formatSignedValue(value: number): string {
    if (value > 0) {
      return `+${value.toLocaleString()}`;
    }

    if (value < 0) {
      return value.toLocaleString();
    }

    return '0';
  }

  getAchievementDeltaClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.achievementPointsDelta);
  }

  getHonorableKillDeltaClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.honorableKillsDelta);
  }

  getAppearanceDeltaClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.appearanceCountDelta);
  }

  getAchievementRankClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.achievementRankDelta);
  }

  getHonorableKillRankClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.honorableKillsRankDelta);
  }

  getAppearanceRankClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.appearanceRankDelta);
  }

  getAchievementRankLabel(player: LadderPlayerView): string {
    return this.formatSignedValue(player.achievementRankDelta);
  }

  getHonorableKillRankLabel(player: LadderPlayerView): string {
    return this.formatSignedValue(player.honorableKillsRankDelta);
  }

  getAppearanceRankLabel(player: LadderPlayerView): string {
    return this.formatSignedValue(player.appearanceRankDelta);
  }

  getAchievementRankTitle(player: LadderPlayerView): string {
    return this.buildRankTitle(player.name, player.achievementRankDelta);
  }

  getHonorableKillRankTitle(player: LadderPlayerView): string {
    return this.buildRankTitle(player.name, player.honorableKillsRankDelta);
  }

  getAppearanceRankTitle(player: LadderPlayerView): string {
    return this.buildRankTitle(player.name, player.appearanceRankDelta);
  }

  getPlayerLinkTitle(player: LadderPlayerView): string {
    if (player.isNewRareAchievementCharacter && player.rareAchievementSummaryLabel) {
      return `New rare character found\n${player.rareAchievementSummaryLabel}`;
    }

    return player.rareAchievementSummaryLabel
      ? player.rareAchievementSummaryLabel
      : `Open ${player.name} on Tauri armory`;
  }

  private getDeltaClass(value: number): string {
    if (value > 0) {
      return 'positive';
    }

    if (value < 0) {
      return 'negative';
    }

    return 'neutral';
  }

  onImageError(event: Event) {
    const image = event.target as HTMLImageElement | null;
    console.error('Failed to load image:', image?.src ?? 'unknown image');
  }

  private buildRankTitle(playerName: string, rankDelta: number): string {
    const rankLabel = Math.abs(rankDelta) === 1 ? 'rank' : 'ranks';

    if (rankDelta > 0) {
      return `${playerName} climbed ${rankDelta.toLocaleString()} ${rankLabel}`;
    }

    if (rankDelta < 0) {
      return `${playerName} dropped ${Math.abs(rankDelta).toLocaleString()} ${rankLabel}`;
    }

    return `${playerName} had no rank change`;
  }
}
