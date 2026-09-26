import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { getClassIconPath } from '../utils/classIconHelper';
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
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatedBattlegroundPlayerHistoryComponent {
  @Input({ required: true }) player!: RatedPlayerSummary;
  @Input({ required: true }) history: ReadonlyArray<RatedPlayerMatchHistoryEntry> = [];
  @Output() readonly closeHistory = new EventEmitter<void>();

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
