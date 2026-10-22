import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

export const BOTTOM_BAR_HEIGHT = '--bottom-bar-height';

export function bottomBarHeight(host: HTMLElement): number {
  const bottom = Number.parseFloat(getComputedStyle(host).bottom) || 0;
  return Math.ceil(host.offsetHeight + Math.max(0, bottom));
}

@Directive({ selector: '[appBottomBar]' })
export class BottomBarDirective {
  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const root = inject(DOCUMENT).documentElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const observer = new ResizeObserver(() => root.style.setProperty(BOTTOM_BAR_HEIGHT, `${bottomBarHeight(host)}px`));
      observer.observe(host);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        root.style.removeProperty(BOTTOM_BAR_HEIGHT);
      });
    });
  }
}
