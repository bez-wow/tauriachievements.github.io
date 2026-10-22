import { Directive, ElementRef, Injector, afterNextRender, effect, inject, input } from '@angular/core';

@Directive({
  selector: '[appScrollToEnd]',
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
