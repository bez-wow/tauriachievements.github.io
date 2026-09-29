import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FilterDropdownComponent } from './filter-dropdown.component';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';
import { LadderClassOption, LadderSelectOption } from './ladder-options';
import { LadderSort } from './ladder.types';

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
  standalone: true,
  imports: [CommonModule, FilterDropdownComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [FilterDropdownCoordinatorService]
})
export class FilterBarComponent {
  @Input() sort: LadderSort = 'achievementPoints';
  @Input() realm?: string;
  @Input() faction?: string;
  @Input() playerClass?: number;
  @Input() pageSize = 100;
  @Input() searchTerm = '';
  @Input() sortOptions: ReadonlyArray<SortOption> = [];
  @Input() realmOptions: ReadonlyArray<TextOption> = [];
  @Input() factionOptions: ReadonlyArray<TextOption> = [];
  @Input() classOptions: ReadonlyArray<ClassOption> = [];
  @Input() pageSizeOptions: ReadonlyArray<number> = [];

  @Output() readonly sortChange = new EventEmitter<LadderSort>();
  @Output() readonly realmChange = new EventEmitter<string | undefined>();
  @Output() readonly factionChange = new EventEmitter<string | undefined>();
  @Output() readonly classChange = new EventEmitter<number | undefined>();
  @Output() readonly pageSizeChange = new EventEmitter<number>();
  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly reset = new EventEmitter<void>();

  private readonly dropdownCoordinator = inject(FilterDropdownCoordinatorService);

  get dropdowns(): ReadonlyArray<DropdownConfig> {
    return [
      {
        key: 'sort',
        triggerId: 'sortSelect',
        ariaLabel: 'Sort by',
        options: this.sortOptions,
        selectedValue: this.sort,
        selectedLabel: this.selectedSortLabel
      },
      {
        key: 'realm',
        triggerId: 'realmSelect',
        ariaLabel: 'Realm',
        options: this.realmOptions,
        selectedValue: this.realm,
        selectedLabel: this.selectedRealmLabel
      },
      {
        key: 'class',
        triggerId: 'classSelect',
        ariaLabel: 'Class',
        options: this.classDropdownOptions,
        selectedValue: this.playerClass,
        selectedLabel: this.selectedClassLabel,
        selectedIcon: this.selectedClassIcon,
        showIcons: true
      },
      {
        key: 'faction',
        triggerId: 'factionSelect',
        ariaLabel: 'Faction',
        options: this.factionOptions,
        selectedValue: this.faction,
        selectedLabel: this.selectedFactionLabel
      }
    ];
  }

  get selectedSortLabel(): string {
    return this.sortOptions.find((option) => option.value === this.sort)?.label ?? 'Achievements';
  }

  get selectedRealmLabel(): string {
    return this.realmOptions.find((option) => option.value === this.realm)?.label ?? 'All Realms';
  }

  get selectedFactionLabel(): string {
    return this.factionOptions.find((option) => option.value === this.faction)?.label ?? 'All Factions';
  }

  get selectedClassLabel(): string {
    return this.selectedClassOption?.name ?? 'All Classes';
  }

  get selectedClassIcon(): string | undefined {
    return this.selectedClassOption?.icon;
  }

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

  trackDropdown(_index: number, dropdown: DropdownConfig): DropdownKey {
    return dropdown.key;
  }

  private get classDropdownOptions(): ReadonlyArray<FilterDropdownOption<number | undefined>> {
    return [
      { value: undefined, label: 'All Classes' },
      ...this.classOptions.map((option) => ({
        value: option.id,
        label: option.name,
        icon: option.icon
      }))
    ];
  }

  private get selectedClassOption(): ClassOption | undefined {
    return this.classOptions.find((option) => option.id === this.playerClass);
  }
}
