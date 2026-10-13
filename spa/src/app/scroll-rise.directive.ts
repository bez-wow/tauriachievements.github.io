import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Marks the elements inside its host (those matching `appScrollRise`, a CSS selector) that start
 * below the bottom of the screen with `data-scroll-rise`, for the stylesheet to have them rise in
 * as they are scrolled up into view (a scroll-driven animation). Only those: a scroll-driven
 * animation keeps its element on a layer of its own, which on some screens draws the text a
 * little softer, and what is on screen when the page opens has nothing to rise in from.
 */
@Directive({
  selector: '[appScrollRise]',
  standalone: true
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
