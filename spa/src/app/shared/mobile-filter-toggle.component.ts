import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-mobile-filter-toggle',
  templateUrl: './mobile-filter-toggle.component.html',
  styleUrls: ['./mobile-filter-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileFilterToggleComponent {
  readonly controlsId = input.required<string>();
  readonly label = input('Filters');
  readonly expanded = input(false);
  readonly activeFilters = input<ReadonlyArray<string>>([]);

  readonly expandedChange = output<boolean>();

  readonly ariaLabel = computed(() => {
    const count = this.activeFilters().length;
    return count > 0 ? `${this.label()}, ${count} active` : this.label();
  });

  toggle(): void {
    this.expandedChange.emit(!this.expanded());
  }
}
