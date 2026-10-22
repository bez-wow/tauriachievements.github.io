
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FilterDropdownComponent } from '../../shared/filter-dropdown.component';
import { FilterDropdownCoordinatorService } from '../../shared/filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from '../../shared/filter-dropdown.types';
import { DEFAULT_PAGE_SIZE, DEFAULT_SORT } from './ladder-options';
import { MobileFilterToggleComponent } from '../../shared/mobile-filter-toggle.component';
import { LadderSort } from './ladder.types';
import { LadderClassOption, LadderSelectOption } from '../../players/player-filter-options';

type DropdownKey = 'class' | 'sort' | 'realm' | 'faction';

type SortOption = LadderSelectOption<LadderSort>;
type TextOption = LadderSelectOption<string | undefined>;
type ClassOption = LadderClassOption;

interface DropdownConfig {
  key: DropdownKey;
  triggerId: string;
  ariaLabel: string;
  options: ReadonlyArray<FilterDropdownOption>;
  selectedValue: FilterDropdownValue;
  selectedLabel: string;
  selectedIcon?: string;
  showIcons?: boolean;
}

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
  imports: [FilterDropdownComponent, MobileFilterToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FilterDropdownCoordinatorService]
})
export class FilterBarComponent {
  readonly sort = input<LadderSort>('achievementPoints');
  readonly realm = input<string>();
  readonly faction = input<string>();
  readonly playerClass = input<number>();
  readonly pageSize = input(100);
  readonly searchTerm = input('');
  readonly sortOptions = input<ReadonlyArray<SortOption>>([]);
  readonly realmOptions = input<ReadonlyArray<TextOption>>([]);
  readonly factionOptions = input<ReadonlyArray<TextOption>>([]);
  readonly classOptions = input<ReadonlyArray<ClassOption>>([]);
  readonly pageSizeOptions = input<ReadonlyArray<number>>([]);

  readonly sortChange = output<LadderSort>();
  readonly realmChange = output<string | undefined>();
  readonly factionChange = output<string | undefined>();
  readonly classChange = output<number | undefined>();
  readonly pageSizeChange = output<number>();
  readonly searchChange = output<string>();
  readonly reset = output<void>();

  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);

  readonly filtersOpen = signal(false);

  private readonly selectedClassOption = computed(() =>
    this.classOptions().find((option) => option.id === this.playerClass()));
  private readonly selectedSortLabel = computed(() =>
    this.sortOptions().find((option) => option.value === this.sort())?.label ?? 'Achievements');
  private readonly selectedRealmLabel = computed(() =>
    this.realmOptions().find((option) => option.value === this.realm())?.label ?? 'All Realms');
  private readonly selectedFactionLabel = computed(() =>
    this.factionOptions().find((option) => option.value === this.faction())?.label ?? 'All Factions');
  private readonly selectedClassLabel = computed(() => this.selectedClassOption()?.name ?? 'All Classes');

  private readonly classDropdownOptions = computed<ReadonlyArray<FilterDropdownOption<number | undefined>>>(() => [
    { value: undefined, label: 'All Classes' },
    ...this.classOptions().map((option) => ({
      value: option.id,
      label: option.name,
      icon: option.icon
    }))
  ]);

  readonly dropdowns = computed<ReadonlyArray<DropdownConfig>>(() => [
    {
      key: 'sort',
      triggerId: 'sortSelect',
      ariaLabel: 'Sort by',
      options: this.sortOptions(),
      selectedValue: this.sort(),
      selectedLabel: this.selectedSortLabel()
    },
    {
      key: 'realm',
      triggerId: 'realmSelect',
      ariaLabel: 'Realm',
      options: this.realmOptions(),
      selectedValue: this.realm(),
      selectedLabel: this.selectedRealmLabel()
    },
    {
      key: 'class',
      triggerId: 'classSelect',
      ariaLabel: 'Class',
      options: this.classDropdownOptions(),
      selectedValue: this.playerClass(),
      selectedLabel: this.selectedClassLabel(),
      selectedIcon: this.selectedClassOption()?.icon,
      showIcons: true
    },
    {
      key: 'faction',
      triggerId: 'factionSelect',
      ariaLabel: 'Faction',
      options: this.factionOptions(),
      selectedValue: this.faction(),
      selectedLabel: this.selectedFactionLabel()
    }
  ]);

  readonly activeFilterLabels = computed(() => {
    const labels: string[] = [];
    if (this.sort() !== DEFAULT_SORT) {
      labels.push(`Sort: ${this.selectedSortLabel()}`);
    }
    if (this.realm()) {
      labels.push(this.selectedRealmLabel());
    }
    if (this.playerClass() !== undefined) {
      labels.push(this.selectedClassLabel());
    }
    if (this.faction()) {
      labels.push(this.selectedFactionLabel());
    }
    if (this.pageSize() !== DEFAULT_PAGE_SIZE) {
      labels.push(`${this.pageSize()} per page`);
    }
    return labels;
  });

  onDropdownSelection(dropdown: DropdownKey, value: FilterDropdownValue): void {
    switch (dropdown) {
      case 'sort':
        this.sortChange.emit(value as LadderSort);
        break;
      case 'realm':
        this.realmChange.emit(value as string | undefined);
        break;
      case 'faction':
        this.factionChange.emit(value as string | undefined);
        break;
      case 'class':
        this.classChange.emit(value as number | undefined);
        break;
    }
  }

  onPageSizeSelect(size: number): void {
    this.pageSizeChange.emit(size);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchChange.emit(input.value);
  }

  resetFilters(): void {
    this.dropdownCoordinator.closeAll();
    this.reset.emit();
  }
}
