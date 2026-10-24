import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { prefersReducedMotion } from './motion/motion';

@Component({
  selector: 'app-pager',
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  readonly count = input<string>();
  readonly label = input('Pages');
  readonly scrollTarget = input<HTMLElement>();

  readonly pageChange = output<number>();

  goTo(page: number): void {
    const target = Math.min(Math.max(1, page), this.pages());
    if (target === this.page()) {
      return;
    }

    this.pageChange.emit(target);
    this.scrollTarget()?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}
