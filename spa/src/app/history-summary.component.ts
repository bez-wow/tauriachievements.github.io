import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { LadderHistoryMoverView } from './ladder-history.types';
import { formatPlayedTime, formatSignedPlayedTime } from './played-time';
import { injectCompactViewport } from './compact-viewport';

/** The four climber lists, named like their inputs (`achievementMovers`, ...). */
export type MoverListKey = 'achievement' | 'honorableKill' | 'playedTime' | 'appearance';

/** On phones each list starts with this many climbers; the rest open per list. */
export const MOBILE_MOVER_PREVIEW_SIZE = 10;

@Component({
  selector: 'app-history-summary',
  templateUrl: './history-summary.component.html',
  styleUrls: ['./history-summary.component.scss'],
  standalone: true,
  imports: [CommonModule, FilterDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorySummaryComponent {
  @Input() achievementSourceLimitOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [];
  @Input() honorableKillSourceLimitOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [];
  @Input() playedTimeSourceLimitOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [];
  @Input() appearanceSourceLimitOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [];
  @Input() achievementSourceLimit?: number;
  @Input() achievementSourceLimitLabel = 'All players';
  @Input() honorableKillSourceLimit?: number;
  @Input() honorableKillSourceLimitLabel = 'All players';
  @Input() playedTimeSourceLimit?: number;
  @Input() playedTimeSourceLimitLabel = 'All players';
  @Input() appearanceSourceLimit?: number;
  @Input() appearanceSourceLimitLabel = 'All players';
  @Input() achievementMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() honorableKillMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() playedTimeMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() appearanceMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() achievementEmptyMessage = 'No achievement climbers available yet.';
  @Input() honorableKillEmptyMessage = 'No honorable kill climbers available yet.';
  @Input() playedTimeEmptyMessage = 'No played time climbers available yet.';
  @Input() appearanceEmptyMessage = 'No appearance climbers available yet.';

  @Output() readonly achievementSourceLimitChange = new EventEmitter<FilterDropdownValue>();
  @Output() readonly honorableKillSourceLimitChange = new EventEmitter<FilterDropdownValue>();
  @Output() readonly playedTimeSourceLimitChange = new EventEmitter<FilterDropdownValue>();
  @Output() readonly appearanceSourceLimitChange = new EventEmitter<FilterDropdownValue>();

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

  trackMover(_index: number, mover: LadderHistoryMoverView): string {
    return mover.playerKey;
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
