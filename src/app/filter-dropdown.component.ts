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
  ViewChildren,
  inject
} from '@angular/core';
import { FilterDropdownCoordinatorService } from './filter-dropdown-coordinator.service';
import { FilterDropdownOption, FilterDropdownValue } from './filter-dropdown.types';

@Component({
  selector: 'app-filter-dropdown',
  templateUrl: './filter-dropdown.component.html',
  styleUrls: ['./filter-dropdown.component.scss'],
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilterDropdownComponent {
  @Input({ required: true }) dropdownId = '';
  @Input({ required: true }) triggerId = '';
  @Input({ required: true }) ariaLabel = '';
  @Input() options: ReadonlyArray<FilterDropdownOption> = [];
  @Input() selectedValue?: FilterDropdownValue;
  @Input() selectedLabel = '';
  @Input() selectedIcon?: string;
  @Input() showIcons = false;

  @Output() readonly selectionChange = new EventEmitter<FilterDropdownValue>();

  @ViewChild('trigger') private triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChildren('optionButton') private optionRefs?: QueryList<ElementRef<HTMLButtonElement>>;

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly coordinator = inject(FilterDropdownCoordinatorService);

  get isOpen(): boolean {
    return this.coordinator.isOpen(this.dropdownId);
  }

  get displaySelectedLabel(): string {
    return this.selectedLabel || this.selectedOption?.label || '';
  }

  get displaySelectedIcon(): string | undefined {
    return this.selectedIcon ?? this.selectedOption?.icon;
  }

  get hasSelectedIcon(): boolean {
    return !!this.displaySelectedIcon;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node) || this.hostRef.nativeElement.contains(target)) {
      return;
    }

    this.coordinator.close(this.dropdownId);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (!this.isOpen) {
      return;
    }

    event.preventDefault();
    this.coordinator.close(this.dropdownId);
    this.focusTrigger();
  }

  onTriggerFocus(): void {
    this.coordinator.closeOthers(this.dropdownId);
  }

  toggleMenu(): void {
    this.coordinator.toggle(this.dropdownId);
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    event.preventDefault();
    this.coordinator.open(this.dropdownId);
    this.focusSelectedOption();
  }

  onOptionKeydown(event: KeyboardEvent, currentIndex: number): void {
    const options = this.getOptionElements();
    if (options.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusOption(currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusOption(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        this.focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        this.focusOption(options.length - 1);
        break;
      case 'Tab':
        this.coordinator.close(this.dropdownId);
        break;
    }
  }

  selectOption(option: FilterDropdownOption): void {
    this.coordinator.close(this.dropdownId);
    this.selectionChange.emit(option.value);
  }

  isOptionSelected(option: FilterDropdownOption): boolean {
    return option.value === this.selectedValue;
  }

  trackOption(index: number, option: FilterDropdownOption): string {
    const valueKey = option.value === undefined ? 'undefined' : String(option.value);
    return `${valueKey}:${option.label}:${index}`;
  }

  private get selectedOption(): FilterDropdownOption | undefined {
    return this.options.find((option) => this.isOptionSelected(option));
  }

  private focusSelectedOption(): void {
    const selectedIndex = this.options.findIndex((option) => this.isOptionSelected(option));
    this.focusOption(selectedIndex === -1 ? 0 : selectedIndex);
  }

  private focusOption(index: number): void {
    const options = this.getOptionElements();
    if (options.length === 0) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(index, options.length - 1));
    setTimeout(() => {
      options[safeIndex]?.focus();
    });
  }

  private focusTrigger(): void {
    this.triggerRef?.nativeElement.focus();
  }

  private getOptionElements(): HTMLButtonElement[] {
    return this.optionRefs?.toArray().map((option) => option.nativeElement) ?? [];
  }
}
