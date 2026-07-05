import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import {
  BattlegroundDayGroup,
  BattlegroundDayRow,
  BattlegroundDurationGroup,
  BattlegroundDurationRow,
  BattlegroundHourlyChartPoint,
  BattlegroundQueueHour,
  BattlegroundQueueRecommendation,
  computeBattlegroundStats,
  getBattlegroundDateBounds,
  normalizeBattlegrounds
} from './battleground-stats';
import { BattlegroundCollectorState, BattlegroundsService } from './battlegrounds.service';
import { UpdateBarComponent } from './update-bar.component';

@Component({
  selector: 'app-battleground-page',
  templateUrl: './battleground-page.component.html',
  styleUrls: ['./battleground-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BattlegroundPageComponent implements OnInit {
  private readonly battlegroundsService = inject(BattlegroundsService);

  readonly battlegrounds = signal(normalizeBattlegrounds([]));
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDay = signal('');
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');

  readonly dateBounds = computed(() => getBattlegroundDateBounds(this.battlegrounds()));
  readonly hasData = computed(() => this.battlegrounds().length > 0);
  readonly showLoading = computed(() => this.isLoading() && !this.hasData());
  readonly showError = computed(() => !this.isLoading() && !!this.loadError() && !this.hasData());
  readonly showContent = computed(() => !this.showLoading() && !this.showError() && this.hasData());
  readonly stats = computed(() =>
    computeBattlegroundStats(this.battlegrounds(), this.selectedDay())
  );

  ngOnInit(): void {
    this.loadBattlegrounds();
  }

  retryLoad(): void {
    this.loadBattlegrounds();
  }

  selectToday(): void {
    const bounds = this.dateBounds();
    if (!bounds) {
      return;
    }

    this.selectedDay.set(this.getDefaultSelectedDate(bounds));
  }

  setSelectedDay(value: string): void {
    this.selectedDay.set(value);
  }

  trackBattlegroundRow(_index: number, row: BattlegroundDayRow): string {
    return row.name;
  }

  trackBattlegroundDayGroup(_index: number, group: BattlegroundDayGroup): string {
    return group.label;
  }

  trackHourlyChartPoint(_index: number, point: BattlegroundHourlyChartPoint): string {
    return point.hour.toString();
  }

  trackQueueRecommendation(_index: number, recommendation: BattlegroundQueueRecommendation): string {
    return recommendation.battlegroundName;
  }

  trackQueueHour(_index: number, hour: BattlegroundQueueHour): string {
    return hour.hour.toString();
  }

  trackDurationRow(_index: number, row: BattlegroundDurationRow): string {
    return row.name;
  }

  trackDurationGroup(_index: number, group: BattlegroundDurationGroup): string {
    return group.label;
  }

  private loadBattlegrounds(): void {
    this.isLoading.set(true);
    this.loadError.set(undefined);

    forkJoin({
      records: this.battlegroundsService.getBattlegrounds(),
      state: this.battlegroundsService.getCollectorState().pipe(
        catchError((error: unknown) => {
          console.warn('Could not load battleground collector state:', error);
          return of(null);
        })
      )
    }).subscribe({
      next: ({ records, state }) => {
        const battlegrounds = normalizeBattlegrounds(records);
        this.battlegrounds.set(battlegrounds);
        this.initializeDateSelection();
        this.applyCollectorState(state);
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load battleground data:', error);
        this.battlegrounds.set([]);
        this.lastEdited.set(undefined);
        this.lastEditedTimeZoneLabel.set('Local time');
        this.loadError.set('We could not load battleground data right now. Please try again in a moment.');
        this.isLoading.set(false);
      }
    });
  }

  private initializeDateSelection(): void {
    const bounds = this.dateBounds();
    if (!bounds) {
      this.selectedDay.set('');
      return;
    }

    if (!this.selectedDay() || this.selectedDay() < bounds.min || this.selectedDay() > bounds.max) {
      this.selectedDay.set(this.getDefaultSelectedDate(bounds));
    }
  }

  private getDefaultSelectedDate(bounds: { min: string; max: string }): string {
    const today = this.getTodayIsoDate();
    return today >= bounds.min && today <= bounds.max ? today : bounds.max;
  }

  private getTodayIsoDate(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private applyCollectorState(state: BattlegroundCollectorState | null): void {
    const parsedDate = this.parseDate(state?.lastScanUtc);
    this.lastEdited.set(parsedDate);
    this.lastEditedTimeZoneLabel.set(this.getTimeZoneLabel(parsedDate));
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  private getTimeZoneLabel(date: Date | undefined): string {
    if (!date) {
      return 'Local time';
    }

    try {
      const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
      return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'Local time';
    } catch {
      return 'Local time';
    }
  }
}
