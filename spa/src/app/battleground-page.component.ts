import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { BackToTopButtonComponent } from './back-to-top-button.component';
import {
  BattlegroundDayGroup,
  BattlegroundDayRow,
  BattlegroundDurationGroup,
  BattlegroundDurationRow,
  BattlegroundEra,
  BattlegroundHourlyChartPoint,
  NormalizedBattleground,
  computeBattlegroundStats,
  decodeBattlegroundSnapshot,
  formatDuration,
  getCompletedBattlegroundDateBounds
} from './battleground-stats';
import { BattlegroundCollectorState, BattlegroundsService } from './battlegrounds.service';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownValue } from './filter-dropdown.types';
import { UpdateBarComponent } from './update-bar.component';
import { getLocalTimeZoneLabel } from '../utils/time-zone-label';

interface BattlegroundStartEntry {
  id: string;
  startLabel: string;
  durationLabel: string;
  durationKnown: boolean;
}

interface BattlegroundStartGroup {
  label: string;
  count: number;
  entries: BattlegroundStartEntry[];
}

interface BattlegroundStartDetails {
  name: string;
  selectedDayLabel: string;
  total: number;
  groups: BattlegroundStartGroup[];
}

const BATTLEGROUND_ERA_OPTIONS: ReadonlyArray<{ value: BattlegroundEra; label: string }> = [
  { value: 'legion', label: 'Legion' },
  { value: 'wod-prepatch', label: 'WoD Prepatch' }
];

@Component({
  selector: 'app-battleground-page',
  templateUrl: './battleground-page.component.html',
  styleUrls: ['./battleground-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, BackToTopButtonComponent, FilterDropdownComponent],
  providers: [FilterDropdownCoordinatorService],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BattlegroundPageComponent implements OnInit {
  private readonly battlegroundsService = inject(BattlegroundsService);

  readonly selectedEra = signal<BattlegroundEra>('legion');
  /** Each era is its own file, loaded the first time that era is shown. */
  private readonly loadedEras = signal<Partial<Record<BattlegroundEra, NormalizedBattleground[]>>>({});
  readonly battlegrounds = computed(() => this.loadedEras()[this.selectedEra()] ?? []);
  readonly eraOptions = BATTLEGROUND_ERA_OPTIONS;
  readonly isLoading = signal(true);
  readonly loadError = signal<string | undefined>(undefined);
  readonly selectedDay = signal('');
  readonly selectedBattlegroundName = signal<string | undefined>(undefined);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');

  readonly dateBounds = computed(() => getCompletedBattlegroundDateBounds(this.battlegrounds()));
  readonly hasData = computed(() => this.battlegrounds().length > 0);
  readonly showLoading = computed(() => this.isLoading() && !this.hasData());
  readonly showError = computed(() => !this.isLoading() && !!this.loadError() && !this.hasData());
  readonly showContent = computed(() => !this.showLoading() && !this.showError() && this.hasData());
  readonly stats = computed(() =>
    computeBattlegroundStats(this.battlegrounds(), this.selectedDay())
  );
  readonly selectedBattlegroundDetails = computed(() => {
    const name = this.selectedBattlegroundName();
    if (!name) {
      return undefined;
    }

    const groups = this.buildBattlegroundStartGroups(name);
    return {
      name,
      selectedDayLabel: this.stats().selectedDayLabel,
      total: groups.reduce((total, group) => total + group.count, 0),
      groups
    };
  });

  ngOnInit(): void {
    this.loadBattlegrounds();
    this.loadCollectorState();
  }

  retryLoad(): void {
    this.loadBattlegrounds();
  }

  setSelectedEra(value: FilterDropdownValue): void {
    if (value !== 'legion' && value !== 'wod-prepatch') {
      return;
    }

    this.closeBattlegroundStarts();
    this.selectedEra.set(value);
    this.loadBattlegrounds();
  }

  setSelectedDay(value: string): void {
    const bounds = this.dateBounds();
    this.closeBattlegroundStarts();

    if (!bounds) {
      this.selectedDay.set('');
      return;
    }

    if (!value || value < bounds.min || value > bounds.max) {
      this.selectedDay.set(this.getDefaultSelectedDate(bounds));
      return;
    }

    this.selectedDay.set(value);
  }

  openBattlegroundStarts(row: BattlegroundDayRow): void {
    this.selectedBattlegroundName.set(row.name);
  }

  closeBattlegroundStarts(): void {
    this.selectedBattlegroundName.set(undefined);
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

  trackDurationRow(_index: number, row: BattlegroundDurationRow): string {
    return row.name;
  }

  trackDurationGroup(_index: number, group: BattlegroundDurationGroup): string {
    return group.label;
  }

  trackStartGroup(_index: number, group: BattlegroundStartGroup): string {
    return group.label;
  }

  trackStartEntry(_index: number, entry: BattlegroundStartEntry): string {
    return entry.id;
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (!this.selectedBattlegroundName()) {
      return;
    }

    event.preventDefault();
    this.closeBattlegroundStarts();
  }

  /** Shows the selected era, loading its file the first time. */
  private loadBattlegrounds(): void {
    const era = this.selectedEra();
    if (this.loadedEras()[era]) {
      this.initializeDateSelection();
      return;
    }

    this.isLoading.set(true);
    this.loadError.set(undefined);

    this.battlegroundsService.getBattlegrounds(era).subscribe({
      next: (snapshot) => {
        this.loadedEras.update((eras) => ({ ...eras, [era]: decodeBattlegroundSnapshot(snapshot) }));
        if (this.selectedEra() === era) {
          this.initializeDateSelection();
          this.isLoading.set(false);
        }
      },
      error: (error: unknown) => {
        console.error('Failed to load battleground data:', error);
        if (this.selectedEra() === era) {
          this.loadError.set('We could not load battleground data right now. Please try again in a moment.');
          this.isLoading.set(false);
        }
      }
    });
  }

  private loadCollectorState(): void {
    this.battlegroundsService.getCollectorState().pipe(
      catchError((error: unknown) => {
        console.warn('Could not load battleground collector state:', error);
        return of(null);
      })
    ).subscribe((state) => this.applyCollectorState(state));
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
    this.lastEditedTimeZoneLabel.set(getLocalTimeZoneLabel(parsedDate));
  }

  private parseDate(value: string | undefined): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
  }

  private buildBattlegroundStartGroups(name: string): BattlegroundStartGroup[] {
    const selectedDay = this.selectedDay();
    const records = this.battlegrounds()
      .filter((record) => record.name === name && record.date === selectedDay)
      .sort((left, right) => this.compareStartRecords(left, right));
    const groups = new Map<string, BattlegroundStartGroup>();

    records.forEach((record, index) => {
      const groupLabel = record.startHour === undefined
        ? 'Unknown time'
        : `${record.startHour.toString().padStart(2, '0')}:00`;
      const group = groups.get(groupLabel) ?? {
        label: groupLabel,
        count: 0,
        entries: []
      };

      group.count++;
      group.entries.push({
        id: `${groupLabel}-${index}`,
        startLabel: this.formatStartLabel(record),
        durationLabel: record.durationMs === undefined ? 'Unknown duration' : formatDuration(record.durationMs),
        durationKnown: record.durationMs !== undefined
      });
      groups.set(groupLabel, group);
    });

    return [...groups.values()];
  }

  private compareStartRecords(left: NormalizedBattleground, right: NormalizedBattleground): number {
    const leftMinute = left.startMinuteOfDay ?? Number.MAX_SAFE_INTEGER;
    const rightMinute = right.startMinuteOfDay ?? Number.MAX_SAFE_INTEGER;

    // Array sort is stable: starts in the same minute keep the order they were collected in.
    return leftMinute - rightMinute;
  }

  private formatStartLabel(record: NormalizedBattleground): string {
    if (record.startMinuteOfDay !== undefined) {
      const hour = Math.floor(record.startMinuteOfDay / 60);
      const minute = record.startMinuteOfDay % 60;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }

    return 'Unknown start';
  }
}
