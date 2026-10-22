import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { getClassIconPath } from '../../game/classIconHelper';
import {
  RatedPlayerMatchHistoryEntry,
  RatedPlayerSummary,
  formatCompact,
  formatDuration,
  formatUnixDateTime,
  getClassColor,
  getClassName,
  getFactionLabel,
  getObjectives,
  getSpec
} from './rated-battleground-stats';

@Component({
  selector: 'app-rated-battleground-player-history',
  templateUrl: './rated-battleground-player-history.component.html',
  styleUrls: ['./rated-battleground-player-history.component.scss'],
  imports: [DecimalPipe, PercentPipe],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundPlayerHistoryComponent {
  readonly player = input.required<RatedPlayerSummary>();
  readonly history = input.required<ReadonlyArray<RatedPlayerMatchHistoryEntry>>();
  readonly closeHistory = output<void>();

  readonly getClassIconPath = getClassIconPath;
  readonly getClassColor = getClassColor;
  readonly getClassName = getClassName;
  readonly getFactionLabel = getFactionLabel;
  readonly getObjectives = getObjectives;
  readonly getSpec = getSpec;
  readonly formatCompact = formatCompact;
  readonly formatDuration = formatDuration;
  readonly formatUnixDateTime = formatUnixDateTime;

  close(): void {
    this.closeHistory.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    event.preventDefault();
    this.close();
  }
}
