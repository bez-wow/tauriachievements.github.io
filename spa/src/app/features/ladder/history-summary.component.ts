import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { getArmoryUrl } from '../../game/armory';
import { getClassIconPath } from '../../game/classIconHelper';
import { getRaceIconPath } from '../../game/raceIconHelper';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { LadderHistoryMoverView } from './ladder-history.types';
import { formatPlayedTime, formatSignedPlayedTime } from './played-time';
import { injectCompactViewport } from '../../shared/compact-viewport';

export type MoverListKey = 'achievement' | 'honorableKill' | 'playedTime' | 'appearance';

export const MOBILE_MOVER_PREVIEW_SIZE = 10;

@Component({
  selector: 'app-history-summary',
  templateUrl: './history-summary.component.html',
  styleUrls: ['./history-summary.component.scss'],
  imports: [FilterDropdownComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorySummaryComponent {
  readonly achievementSourceLimitOptions = input<ReadonlyArray<FilterDropdownOption<number | undefined>>>([]);
  readonly honorableKillSourceLimitOptions = input<ReadonlyArray<FilterDropdownOption<number | undefined>>>([]);
  readonly playedTimeSourceLimitOptions = input<ReadonlyArray<FilterDropdownOption<number | undefined>>>([]);
  readonly appearanceSourceLimitOptions = input<ReadonlyArray<FilterDropdownOption<number | undefined>>>([]);
  readonly achievementSourceLimit = input<number>();
  readonly achievementSourceLimitLabel = input('All players');
  readonly honorableKillSourceLimit = input<number>();
  readonly honorableKillSourceLimitLabel = input('All players');
  readonly playedTimeSourceLimit = input<number>();
  readonly playedTimeSourceLimitLabel = input('All players');
  readonly appearanceSourceLimit = input<number>();
  readonly appearanceSourceLimitLabel = input('All players');
  readonly achievementMovers = input<ReadonlyArray<LadderHistoryMoverView>>([]);
  readonly honorableKillMovers = input<ReadonlyArray<LadderHistoryMoverView>>([]);
  readonly playedTimeMovers = input<ReadonlyArray<LadderHistoryMoverView>>([]);
  readonly appearanceMovers = input<ReadonlyArray<LadderHistoryMoverView>>([]);
  readonly achievementEmptyMessage = input('No achievement climbers available yet.');
  readonly honorableKillEmptyMessage = input('No honorable kill climbers available yet.');
  readonly playedTimeEmptyMessage = input('No played time climbers available yet.');
  readonly appearanceEmptyMessage = input('No appearance climbers available yet.');

  readonly achievementSourceLimitChange = output<FilterDropdownValue>();
  readonly honorableKillSourceLimitChange = output<FilterDropdownValue>();
  readonly playedTimeSourceLimitChange = output<FilterDropdownValue>();
  readonly appearanceSourceLimitChange = output<FilterDropdownValue>();

  readonly getArmoryUrl = getArmoryUrl;
  readonly getClassIconPath = getClassIconPath;
  readonly getRaceIconPath = getRaceIconPath;

  private readonly isCompactViewport = injectCompactViewport();
  private readonly expandedLists = signal<ReadonlySet<MoverListKey>>(new Set());

  visibleMovers(movers: ReadonlyArray<LadderHistoryMoverView>, list: MoverListKey): ReadonlyArray<LadderHistoryMoverView> {
    return this.canToggleList(movers) && !this.isListExpanded(list)
      ? movers.slice(0, MOBILE_MOVER_PREVIEW_SIZE)
      : movers;
  }

  canToggleList(movers: ReadonlyArray<LadderHistoryMoverView>): boolean {
    return this.isCompactViewport() && movers.length > MOBILE_MOVER_PREVIEW_SIZE;
  }

  isListExpanded(list: MoverListKey): boolean {
    return this.expandedLists().has(list);
  }

  toggleList(list: MoverListKey): void {
    this.expandedLists.update((expanded) => {
      const next = new Set(expanded);
      if (!next.delete(list)) {
        next.add(list);
      }
      return next;
    });
  }

  listToggleLabel(movers: ReadonlyArray<LadderHistoryMoverView>, list: MoverListKey): string {
    return this.isListExpanded(list) ? `Show top ${MOBILE_MOVER_PREVIEW_SIZE}` : `Show all ${movers.length}`;
  }

  hasRaceIcon(mover: LadderHistoryMoverView): boolean {
    return mover.race > 0;
  }

  hasClassIcon(mover: LadderHistoryMoverView): boolean {
    return mover.classId > 0;
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

  formatPlayedTime(value: number): string {
    return formatPlayedTime(value);
  }

  formatSignedPlayedTime(value: number): string {
    return formatSignedPlayedTime(value);
  }

  getDeltaClass(value: number): string {
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
}
