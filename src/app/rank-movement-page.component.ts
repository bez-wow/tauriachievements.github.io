import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { HistorySummaryComponent } from './history-summary.component';
import { buildHistoryComparisonLabel } from './ladder-history.mapper';
import { LadderHistoryData, LadderHistoryMoverView } from './ladder-history.types';
import { CLASS_OPTIONS, PAGE_SIZE_OPTIONS, REALM_OPTIONS } from './ladder-options';
import { LadderHistoryService } from './services/ladder-history.service';
import { LadderLastUpdatedService } from './services/ladder-last-updated.service';
import { UpdateBarComponent } from './update-bar.component';

type TopGainersDropdownKey = 'limit' | 'realm' | 'class';

interface TopGainersDropdownConfig {
  key: TopGainersDropdownKey;
  triggerId: string;
  ariaLabel: string;
  options: ReadonlyArray<FilterDropdownOption>;
  selectedValue: FilterDropdownValue;
  selectedLabel: string;
  selectedIcon?: string;
  showIcons?: boolean;
}

const DEFAULT_TOP_GAINERS_LIMIT = 100;
const DEFAULT_ACHIEVEMENT_SOURCE_LIMIT = 1000;
const DEFAULT_HONORABLE_KILL_SOURCE_LIMIT: number | undefined = undefined;
const ACHIEVEMENT_SOURCE_LIMIT_OPTIONS: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
  { value: 100, label: 'Achievement Top 100' },
  { value: 500, label: 'Achievement Top 500' },
  { value: 1000, label: 'Achievement Top 1000' },
  { value: undefined, label: 'All players' }
];
const HONORABLE_KILL_SOURCE_LIMIT_OPTIONS: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
  { value: 100, label: 'HK Top 100' },
  { value: 500, label: 'HK Top 500' },
  { value: 1000, label: 'HK Top 1000' },
  { value: undefined, label: 'All players' }
];

@Component({
  selector: 'app-rank-movement-page',
  templateUrl: './rank-movement-page.component.html',
  styleUrls: ['./rank-movement-page.component.scss'],
  standalone: true,
  imports: [CommonModule, UpdateBarComponent, FilterDropdownComponent, HistorySummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FilterDropdownCoordinatorService]
})
export class TopGainersPageComponent implements OnInit {
  private readonly historyService = inject(LadderHistoryService);
  private readonly ladderLastUpdatedService = inject(LadderLastUpdatedService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);

  readonly history = signal<LadderHistoryData | null>(null);
  readonly lastEdited = signal<Date | undefined>(undefined);
  readonly lastEditedTimeZoneLabel = signal('Local time');
  readonly topGainersLimit = signal(DEFAULT_TOP_GAINERS_LIMIT);
  readonly achievementSourceLimit = signal<number | undefined>(DEFAULT_ACHIEVEMENT_SOURCE_LIMIT);
  readonly honorableKillSourceLimit = signal<number | undefined>(DEFAULT_HONORABLE_KILL_SOURCE_LIMIT);
  readonly currentRealm = signal<string | undefined>(undefined);
  readonly currentClass = signal<number | undefined>(undefined);
  readonly limitOptions: ReadonlyArray<FilterDropdownOption<number>> = PAGE_SIZE_OPTIONS.map((size) => ({
    value: size,
    label: `Display Top ${size}`
  }));
  readonly achievementSourceLimitOptions = ACHIEVEMENT_SOURCE_LIMIT_OPTIONS;
  readonly honorableKillSourceLimitOptions = HONORABLE_KILL_SOURCE_LIMIT_OPTIONS;
  readonly realmOptions = REALM_OPTIONS;
  readonly classOptions: ReadonlyArray<FilterDropdownOption<number | undefined>> = [
    { value: undefined, label: 'All Classes' },
    ...CLASS_OPTIONS.map((option) => ({
      value: option.id,
      label: option.name,
      icon: option.icon
    }))
  ];
  readonly comparisonLabel = computed(() => buildHistoryComparisonLabel(this.history()?.snapshots ?? []));
  readonly snapshotCount = computed(() => this.history()?.snapshots.length ?? 0);
  readonly achievementMovers = computed(() =>
    this.filterMovers(this.history()?.movers.achievementPoints ?? [], this.achievementSourceLimit())
  );
  readonly honorableKillMovers = computed(() =>
    this.filterMovers(this.history()?.movers.honorableKills ?? [], this.honorableKillSourceLimit())
  );
  readonly historyAvailable = computed(() => this.snapshotCount() > 1);
  readonly hasActiveFilters = computed(() =>
    this.topGainersLimit() !== DEFAULT_TOP_GAINERS_LIMIT
      || this.achievementSourceLimit() !== DEFAULT_ACHIEVEMENT_SOURCE_LIMIT
      || this.honorableKillSourceLimit() !== DEFAULT_HONORABLE_KILL_SOURCE_LIMIT
      || !!this.currentRealm()
      || this.currentClass() !== undefined
  );
  readonly achievementEmptyMessage = computed(() => this.hasActiveFilters()
    ? 'No achievement climbers match the selected filters.'
    : 'No achievement climbers available yet.'
  );
  readonly honorableKillEmptyMessage = computed(() => this.hasActiveFilters()
    ? 'No honorable kill climbers match the selected filters.'
    : 'No honorable kill climbers available yet.'
  );

  get dropdowns(): ReadonlyArray<TopGainersDropdownConfig> {
    return [
      {
        key: 'limit',
        triggerId: 'topGainersLimitSelect',
        ariaLabel: 'Top gainers shown',
        options: this.limitOptions,
        selectedValue: this.topGainersLimit(),
        selectedLabel: this.selectedLimitLabel
      },
      {
        key: 'realm',
        triggerId: 'topGainersRealmSelect',
        ariaLabel: 'Realm',
        options: this.realmOptions,
        selectedValue: this.currentRealm(),
        selectedLabel: this.selectedRealmLabel
      },
      {
        key: 'class',
        triggerId: 'topGainersClassSelect',
        ariaLabel: 'Class',
        options: this.classOptions,
        selectedValue: this.currentClass(),
        selectedLabel: this.selectedClassLabel,
        selectedIcon: this.selectedClassIcon,
        showIcons: true
      }
    ];
  }

  get selectedLimitLabel(): string {
    return this.limitOptions.find((option) => option.value === this.topGainersLimit())?.label ?? 'Display Top 100';
  }

  get selectedAchievementSourceLimitLabel(): string {
    return this.getSourceLimitLabel(this.achievementSourceLimit());
  }

  get selectedHonorableKillSourceLimitLabel(): string {
    return this.getHonorableKillSourceLimitLabel(this.honorableKillSourceLimit());
  }

  get selectedRealmLabel(): string {
    return this.realmOptions.find((option) => option.value === this.currentRealm())?.label ?? 'All Realms';
  }

  get selectedClassLabel(): string {
    return this.selectedClassOption?.label ?? 'All Classes';
  }

  get selectedClassIcon(): string | undefined {
    return this.selectedClassOption?.icon;
  }

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

  onDropdownSelection(dropdown: TopGainersDropdownKey, value: FilterDropdownValue): void {
    switch (dropdown) {
      case 'limit':
        this.topGainersLimit.set(value as number);
        break;
      case 'realm':
        this.currentRealm.set(value as string | undefined);
        break;
      case 'class':
        this.currentClass.set(value as number | undefined);
        break;
    }
  }

  onAchievementSourceLimitSelection(value: FilterDropdownValue): void {
    this.achievementSourceLimit.set(value as number | undefined);
  }

  onHonorableKillSourceLimitSelection(value: FilterDropdownValue): void {
    this.honorableKillSourceLimit.set(value as number | undefined);
  }

  resetFilters(): void {
    this.dropdownCoordinator.closeAll();
    this.topGainersLimit.set(DEFAULT_TOP_GAINERS_LIMIT);
    this.achievementSourceLimit.set(DEFAULT_ACHIEVEMENT_SOURCE_LIMIT);
    this.honorableKillSourceLimit.set(DEFAULT_HONORABLE_KILL_SOURCE_LIMIT);
    this.currentRealm.set(undefined);
    this.currentClass.set(undefined);
  }

  trackDropdown(_index: number, dropdown: TopGainersDropdownConfig): TopGainersDropdownKey {
    return dropdown.key;
  }

  private filterMovers(
    movers: ReadonlyArray<LadderHistoryMoverView>,
    sourceLimit: number | undefined
  ): LadderHistoryMoverView[] {
    const realm = this.currentRealm();
    const playerClass = this.currentClass();

    return movers
      .filter((mover) => {
        if (sourceLimit !== undefined && (mover.currentRank > sourceLimit || mover.previousRank > sourceLimit)) {
          return false;
        }

        if (realm && mover.realm !== realm) {
          return false;
        }

        if (playerClass !== undefined && mover.classId !== playerClass) {
          return false;
        }

        return true;
      })
      .slice(0, this.topGainersLimit());
  }

  private get selectedClassOption(): FilterDropdownOption<number | undefined> | undefined {
    return this.classOptions.find((option) => option.value === this.currentClass());
  }

  private getSourceLimitLabel(sourceLimit: number | undefined): string {
    return this.achievementSourceLimitOptions.find((option) => option.value === sourceLimit)?.label ?? 'All players';
  }

  private getHonorableKillSourceLimitLabel(sourceLimit: number | undefined): string {
    return this.honorableKillSourceLimitOptions.find((option) => option.value === sourceLimit)?.label ?? 'All players';
  }
}
