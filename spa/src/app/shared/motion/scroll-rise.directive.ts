import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

@Directive({
  selector: '[appScrollRise]',
})
export class ScrollRiseDirective {
  readonly appScrollRise = input.required<string>();

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    afterNextRender(() => {
      for (const element of host.querySelectorAll<HTMLElement>(this.appScrollRise())) {
        if (element.getBoundingClientRect().top >= window.innerHeight) {
          element.setAttribute('data-scroll-rise', '');
        }
      }
    });
  }
}
