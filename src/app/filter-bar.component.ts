import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  QueryList,
  ViewChild,
  ViewChildren
} from '@angular/core';
import { LadderSort } from './ladder.types';

type DropdownKey = 'class' | 'sort' | 'realm' | 'faction';

interface SortOption {
  value: LadderSort;
  label: string;
}

interface TextOption {
  value: string | undefined;
  label: string;
}

interface ClassOption {
  id: number;
  name: string;
  icon: string;
}

@Component({
  selector: 'app-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilterBarComponent {
  @Input() sort: LadderSort = 'achievementPoints';
  @Input() realm?: string;
  @Input() faction?: string;
  @Input() playerClass?: number;
  @Input() pageSize = 100;
  @Input() searchTerm = '';
  @Input() sortOptions: SortOption[] = [];
  @Input() realmOptions: TextOption[] = [];
  @Input() factionOptions: TextOption[] = [];
  @Input() classOptions: ClassOption[] = [];
  @Input() pageSizeOptions: number[] = [];

  @Output() readonly sortChange = new EventEmitter<LadderSort>();
  @Output() readonly realmChange = new EventEmitter<string | undefined>();
  @Output() readonly factionChange = new EventEmitter<string | undefined>();
  @Output() readonly classChange = new EventEmitter<number | undefined>();
  @Output() readonly pageSizeChange = new EventEmitter<number>();
  @Output() readonly searchChange = new EventEmitter<string>();
  @Output() readonly reset = new EventEmitter<void>();

  sortMenuOpen = false;
  realmMenuOpen = false;
  factionMenuOpen = false;
  classMenuOpen = false;

  @ViewChild('sortTrigger') private sortTriggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('realmTrigger') private realmTriggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('classTrigger') private classTriggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('factionTrigger') private factionTriggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChildren('sortOption') private sortOptionRefs?: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChildren('realmOption') private realmOptionRefs?: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChildren('classOption') private classOptionRefs?: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChildren('factionOption') private factionOptionRefs?: QueryList<ElementRef<HTMLButtonElement>>;

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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('.dropdown')) {
      this.closeAllDropdowns();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    const openDropdown = this.getOpenDropdown();
    if (!openDropdown) {
      return;
    }

    event.preventDefault();
    this.closeAllDropdowns();
    this.focusDropdownTrigger(openDropdown);
  }

  toggleClassMenu() {
    this.toggleDropdown('class');
  }

  toggleSortMenu() {
    this.toggleDropdown('sort');
  }

  toggleRealmMenu() {
    this.toggleDropdown('realm');
  }

  toggleFactionMenu() {
    this.toggleDropdown('faction');
  }

  onDropdownTriggerKeydown(event: KeyboardEvent, dropdown: DropdownKey) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    this.openDropdown(dropdown);
    this.focusSelectedDropdownOption(dropdown);
  }

  onDropdownOptionKeydown(event: KeyboardEvent, dropdown: DropdownKey, currentIndex: number) {
    const options = this.getDropdownOptionElements(dropdown);
    if (options.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusDropdownOption(dropdown, currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusDropdownOption(dropdown, currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusDropdownOption(dropdown, 0);
        break;
      case 'End':
        event.preventDefault();
        this.focusDropdownOption(dropdown, options.length - 1);
        break;
      case 'Tab':
        this.closeAllDropdowns();
        break;
    }
  }

  selectSort(option: SortOption) {
    this.sortMenuOpen = false;
    this.sortChange.emit(option.value);
  }

  selectRealm(option: TextOption) {
    this.realmMenuOpen = false;
    this.realmChange.emit(option.value);
  }

  selectFaction(option: TextOption) {
    this.factionMenuOpen = false;
    this.factionChange.emit(option.value);
  }

  selectClass(option?: ClassOption) {
    this.classMenuOpen = false;
    this.classChange.emit(option?.id);
  }

  onPageSizeSelect(size: number) {
    this.pageSizeChange.emit(size);
  }

  onSearchInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchChange.emit(input.value);
  }

  resetFilters() {
    this.closeAllDropdowns();
    this.reset.emit();
  }

  closeAllDropdowns(except?: DropdownKey) {
    if (except !== 'class') this.classMenuOpen = false;
    if (except !== 'sort') this.sortMenuOpen = false;
    if (except !== 'realm') this.realmMenuOpen = false;
    if (except !== 'faction') this.factionMenuOpen = false;
  }

  private get selectedClassOption(): ClassOption | undefined {
    return this.classOptions.find((option) => option.id === this.playerClass);
  }

  private toggleDropdown(dropdown: DropdownKey) {
    const nextState = !this.isDropdownOpen(dropdown);
    this.closeAllDropdowns(dropdown);
    this.setDropdownOpen(dropdown, nextState);
  }

  private openDropdown(dropdown: DropdownKey) {
    this.closeAllDropdowns(dropdown);
    this.setDropdownOpen(dropdown, true);
  }

  private isDropdownOpen(dropdown: DropdownKey): boolean {
    switch (dropdown) {
      case 'sort':
        return this.sortMenuOpen;
      case 'realm':
        return this.realmMenuOpen;
      case 'class':
        return this.classMenuOpen;
      case 'faction':
        return this.factionMenuOpen;
    }
  }

  private setDropdownOpen(dropdown: DropdownKey, isOpen: boolean) {
    switch (dropdown) {
      case 'sort':
        this.sortMenuOpen = isOpen;
        break;
      case 'realm':
        this.realmMenuOpen = isOpen;
        break;
      case 'class':
        this.classMenuOpen = isOpen;
        break;
      case 'faction':
        this.factionMenuOpen = isOpen;
        break;
    }
  }

  private getOpenDropdown(): DropdownKey | null {
    if (this.sortMenuOpen) return 'sort';
    if (this.realmMenuOpen) return 'realm';
    if (this.classMenuOpen) return 'class';
    if (this.factionMenuOpen) return 'faction';
    return null;
  }

  private focusSelectedDropdownOption(dropdown: DropdownKey) {
    this.focusDropdownOption(dropdown, this.getSelectedDropdownOptionIndex(dropdown));
  }

  private focusDropdownOption(dropdown: DropdownKey, index: number) {
    const options = this.getDropdownOptionElements(dropdown);
    if (options.length === 0) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, options.length - 1));
    setTimeout(() => {
      options[safeIndex]?.focus();
    });
  }

  private focusDropdownTrigger(dropdown: DropdownKey) {
    this.getDropdownTriggerElement(dropdown)?.focus();
  }

  private getDropdownTriggerElement(dropdown: DropdownKey): HTMLButtonElement | undefined {
    switch (dropdown) {
      case 'sort':
        return this.sortTriggerRef?.nativeElement;
      case 'realm':
        return this.realmTriggerRef?.nativeElement;
      case 'class':
        return this.classTriggerRef?.nativeElement;
      case 'faction':
        return this.factionTriggerRef?.nativeElement;
    }
  }

  private getDropdownOptionElements(dropdown: DropdownKey): HTMLButtonElement[] {
    switch (dropdown) {
      case 'sort':
        return this.sortOptionRefs?.toArray().map((option) => option.nativeElement) ?? [];
      case 'realm':
        return this.realmOptionRefs?.toArray().map((option) => option.nativeElement) ?? [];
      case 'class':
        return this.classOptionRefs?.toArray().map((option) => option.nativeElement) ?? [];
      case 'faction':
        return this.factionOptionRefs?.toArray().map((option) => option.nativeElement) ?? [];
    }
  }

  private getSelectedDropdownOptionIndex(dropdown: DropdownKey): number {
    switch (dropdown) {
      case 'sort':
        return this.sortOptions.findIndex((option) => option.value === this.sort);
      case 'realm':
        return this.realmOptions.findIndex((option) => option.value === this.realm);
      case 'faction':
        return this.factionOptions.findIndex((option) => option.value === this.faction);
      case 'class':
        return this.playerClass === undefined
          ? 0
          : Math.max(0, this.classOptions.findIndex((option) => option.id === this.playerClass) + 1);
    }
  }
}
