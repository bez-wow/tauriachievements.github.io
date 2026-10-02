import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, Input } from '@angular/core';
import { getGuildArmoryUrl, getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { formatCharacterAge } from './character-age';
import { formatPlayedTime, formatSignedPlayedTime } from './played-time';
import { HighlightPart, LadderPlayerView, LadderSort } from './ladder.types';
import { COMPACT_VIEWPORT_QUERY } from './compact-viewport';

/** One line of the details panel that lists a compact row's hidden values. */
export interface PlayerDetailMetric {
  label: string;
  value: string;
  delta?: string;
  deltaClass?: string;
}

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

  activePlayerTooltip = '';
  expandedPlayerKey: string | null = null;
  playerTooltipLeft = 0;
  playerTooltipTop = 0;

  readonly getClassIconPath = getClassIconPath;
  readonly getArmoryUrl = getArmoryUrl;
  readonly getGuildArmoryUrl = getGuildArmoryUrl;

  trackPlayer(_index: number, player: LadderPlayerView): string {
    return `${player.realm}::${player.name}`;
  }

  trackHighlightPart(index: number, _part: HighlightPart): number {
    return index;
  }

  isExpanded(player: LadderPlayerView): boolean {
    return this.expandedPlayerKey === this.trackPlayer(0, player);
  }

  getDetailsId(player: LadderPlayerView): string {
    return 'player-details-' + player.rank;
  }

  /** Opens or closes the details panel under a row. One row is open at a time. */
  togglePlayerDetails(player: LadderPlayerView): void {
    this.expandedPlayerKey = this.isExpanded(player) ? null : this.trackPlayer(0, player);
  }

  /** On phones the whole row toggles its details; links in the row keep working as links. */
  onRowClick(event: MouseEvent, player: LadderPlayerView): void {
    const target = event.target as Element | null;
    if (target?.closest('a, button') || !window.matchMedia(COMPACT_VIEWPORT_QUERY).matches) {
      return;
    }

    this.togglePlayerDetails(player);
  }

  getDetailMetrics(player: LadderPlayerView): PlayerDetailMetric[] {
    const metric = (label: string, value: string, delta: number, formattedDelta: string): PlayerDetailMetric =>
      delta !== 0 ? { label, value, delta: formattedDelta, deltaClass: this.getDeltaClass(delta) } : { label, value };

    return [
      metric('Character achievements', player.achievementPoints.toLocaleString(), player.achievementPointsDelta, this.formatSignedValue(player.achievementPointsDelta)),
      metric('Account wide achievements', this.formatAchievementsTotal(player), this.showAchievementsTotalDelta(player) ? player.achievementsTotalDelta : 0, this.formatSignedValue(player.achievementsTotalDelta)),
      metric('Honorable kills', player.honorableKills.toLocaleString(), player.honorableKillsDelta, this.formatSignedValue(player.honorableKillsDelta)),
      metric('Time played', this.formatPlayedTime(player), player.playedTimeDelta, this.formatPlayedTimeDelta(player)),
      metric('Item level', player.ilvl.toLocaleString(undefined, { maximumFractionDigits: 2 }), 0, ''),
      metric('Appearances', player.appearanceCount.toLocaleString(), player.appearanceCountDelta, this.formatSignedValue(player.appearanceCountDelta))
    ];
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

  hasAchievementsTotalValue(player: LadderPlayerView): boolean {
    return player.achievementsTotal >= 0;
  }

  formatAchievementsTotal(player: LadderPlayerView): string {
    return this.hasAchievementsTotalValue(player) ? player.achievementsTotal.toLocaleString() : '-';
  }

  getAchievementsTotalValueTitle(player: LadderPlayerView): string {
    return this.hasAchievementsTotalValue(player)
      ? ''
      : `No data yet: ${player.name} has not logged in since account-wide achievements were introduced`;
  }

  showAchievementsTotalDelta(player: LadderPlayerView): boolean {
    return this.hasAchievementsTotalValue(player) && player.achievementsTotalDelta !== 0;
  }

  showAchievementsTotalRank(player: LadderPlayerView): boolean {
    return this.currentSort === 'achievementsTotal'
      && this.hasAchievementsTotalValue(player)
      && player.achievementsTotalRankDelta !== 0;
  }

  showPlayedTimeDelta(player: LadderPlayerView): boolean {
    return player.playedTimeDelta !== 0;
  }

  showPlayedTimeRank(player: LadderPlayerView): boolean {
    return this.currentSort === 'playedTime' && player.playedTimeRankDelta !== 0;
  }

  formatPlayedTime(player: LadderPlayerView): string {
    return formatPlayedTime(player.playedTime);
  }

  formatPlayedTimeDelta(player: LadderPlayerView): string {
    return formatSignedPlayedTime(player.playedTimeDelta);
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

  getAchievementsTotalDeltaClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.achievementsTotalDelta);
  }

  getPlayedTimeDeltaClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.playedTimeDelta);
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

  getAchievementsTotalRankClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.achievementsTotalRankDelta);
  }

  getPlayedTimeRankClass(player: LadderPlayerView): string {
    return this.getDeltaClass(player.playedTimeRankDelta);
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

  getAchievementsTotalRankLabel(player: LadderPlayerView): string {
    return this.formatSignedValue(player.achievementsTotalRankDelta);
  }

  getPlayedTimeRankLabel(player: LadderPlayerView): string {
    return this.formatSignedValue(player.playedTimeRankDelta);
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

  getAchievementsTotalRankTitle(player: LadderPlayerView): string {
    return this.buildRankTitle(player.name, player.achievementsTotalRankDelta);
  }

  getPlayedTimeRankTitle(player: LadderPlayerView): string {
    return this.buildRankTitle(player.name, player.playedTimeRankDelta);
  }

  getPlayerLinkTitle(player: LadderPlayerView): string {
    const titleLines: string[] = [];

    if (player.isNewRareAchievementCharacter && player.rareAchievementSummaryLabel) {
      titleLines.push('New rare character found', player.rareAchievementSummaryLabel);
    } else if (player.rareAchievementSummaryLabel) {
      titleLines.push(player.rareAchievementSummaryLabel);
    }

    const characterAge = this.getCharacterAge(player);
    if (characterAge) {
      titleLines.push(`Character Age: ${characterAge}`);
    }

    return titleLines.join('\n');
  }

  getCharacterAge(player: LadderPlayerView): string {
    return formatCharacterAge(player.level10Day);
  }

  showPlayerTooltip(event: MouseEvent | FocusEvent, tooltip: string): void {
    if (!tooltip) {
      return;
    }

    this.activePlayerTooltip = tooltip;
    this.positionPlayerTooltip(event.currentTarget as HTMLElement | null, tooltip);
  }

  movePlayerTooltip(event: MouseEvent): void {
    if (!this.activePlayerTooltip) {
      return;
    }

    this.positionPlayerTooltip(event.currentTarget as HTMLElement | null, this.activePlayerTooltip);
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  hidePlayerTooltip(): void {
    this.activePlayerTooltip = '';
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

  private positionPlayerTooltip(anchor: HTMLElement | null, tooltip: string): void {
    if (!anchor) {
      return;
    }

    const viewportPadding = 8;
    const anchorGap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipSize = this.estimateTooltipSize(tooltip);
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const maxLeft = viewportWidth - tooltipSize.width - viewportPadding;
    const preferredTop = anchorRect.bottom + anchorGap;
    const fallbackTop = anchorRect.top - tooltipSize.height - anchorGap;

    this.playerTooltipLeft = Math.max(
      viewportPadding,
      Math.min(anchorRect.left, Math.max(viewportPadding, maxLeft))
    );

    this.playerTooltipTop = preferredTop + tooltipSize.height <= viewportHeight - viewportPadding
      ? preferredTop
      : Math.max(viewportPadding, fallbackTop);
  }

  private estimateTooltipSize(tooltip: string): { width: number; height: number } {
    const lines = tooltip.split('\n');
    const longestLineLength = Math.max(...lines.map((line) => line.length), 1);

    return {
      width: Math.min(420, Math.max(80, longestLineLength * 7 + 12)),
      height: lines.length * 16 + 8
    };
  }
}
