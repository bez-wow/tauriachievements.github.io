import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { getArmoryUrl } from '../utils/armory';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { LadderHistoryMoverView } from './ladder-history.types';

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
  @Input() achievementSourceLimit?: number;
  @Input() achievementSourceLimitLabel = 'All players';
  @Input() honorableKillSourceLimit?: number;
  @Input() honorableKillSourceLimitLabel = 'All players';
  @Input() achievementMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() honorableKillMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() achievementEmptyMessage = 'No achievement climbers available yet.';
  @Input() honorableKillEmptyMessage = 'No honorable kill climbers available yet.';

  @Output() readonly achievementSourceLimitChange = new EventEmitter<FilterDropdownValue>();
  @Output() readonly honorableKillSourceLimitChange = new EventEmitter<FilterDropdownValue>();

  readonly getArmoryUrl = getArmoryUrl;
  readonly getClassIconPath = getClassIconPath;
  readonly getRaceIconPath = getRaceIconPath;

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
