import { Directive, ElementRef, Injector, afterNextRender, effect, inject, input } from '@angular/core';

/**
 * Scrolls a sideways-scrolling element to its right end: a timeline that is wider than the
 * screen opens on its newest entries instead of its oldest. It scrolls again whenever the
 * bound value changes (pass something that changes with the content, like its length), and
 * leaves the reader's own scrolling alone in between.
 */
@Directive({
  selector: '[appScrollToEnd]',
  standalone: true
})
export class ScrollToEndDirective {
  readonly appScrollToEnd = input<unknown>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      this.appScrollToEnd();
      afterNextRender(() => {
        this.host.scrollLeft = this.host.scrollWidth;
      }, { injector: this.injector });
    });
  }
}
