import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HistorySummaryComponent } from './history-summary.component';
import { buildHistoryComparisonLabel } from './ladder-history.mapper';
import { LadderHistoryData } from './ladder-history.types';
import { LadderHistoryService } from './services/ladder-history.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

@Component({
  selector: 'app-rank-movement-page',
  templateUrl: './rank-movement-page.component.html',
  styleUrls: ['./rank-movement-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, HistorySummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopGainersPageComponent implements OnInit {
  private readonly historyService = inject(LadderHistoryService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);

  readonly history = signal<LadderHistoryData | null>(null);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly comparisonLabel = computed(() => buildHistoryComparisonLabel(this.history()?.snapshots ?? []));
  readonly snapshotCount = computed(() => this.history()?.snapshots.length ?? 0);
  readonly achievementMovers = computed(() => this.history()?.movers.achievementPoints ?? []);
  readonly honorableKillMovers = computed(() => this.history()?.movers.honorableKills ?? []);
  readonly historyAvailable = computed(() => this.snapshotCount() > 1);

  ngOnInit(): void {
    this.historyService.getHistory().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((history) => {
      this.history.set(history);
    });

    this.ladderLastUpdatedService.getLastUpdated().pipe(
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((lastUpdated) => {
      if (!lastUpdated) {
        return;
      }

      this.lastEdited.set(lastUpdated.date);
      this.lastEditedTimeZoneLabel.set(lastUpdated.timeZoneLabel);
    });
  }
}
