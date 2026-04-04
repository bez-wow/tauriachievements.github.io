import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { getClassIconPath } from '../utils/classIconHelper';
import { getRaceIconPath } from '../utils/raceIconHelper';
import { LadderHistoryMoverView } from './ladder-history.types';

@Component({
  selector: 'app-history-summary',
  templateUrl: './history-summary.component.html',
  styleUrls: ['./history-summary.component.scss'],
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistorySummaryComponent {
  @Input() comparisonLabel = '';
  @Input() achievementMovers: ReadonlyArray<LadderHistoryMoverView> = [];
  @Input() honorableKillMovers: ReadonlyArray<LadderHistoryMoverView> = [];

  readonly getClassIconPath = getClassIconPath;
  readonly getRaceIconPath = getRaceIconPath;

  getPlayerRoute(mover: LadderHistoryMoverView): string[] {
    return ['/player', mover.realm, mover.name];
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
