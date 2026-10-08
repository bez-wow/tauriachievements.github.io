import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Tracks the mouse over its host in --spot-x / --spot-y (pixels from the host's top-left corner),
 * so the stylesheet can light the card's border where the pointer is. Mouse only: a finger has no
 * hover to follow. The listener is a plain DOM one, so moving the mouse renders nothing in Angular.
 */
@Directive({
  selector: '[appSpotlight]',
  standalone: true
})
export class SpotlightDirective {
  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        return;
      }
      const rect = host.getBoundingClientRect();
      host.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
      host.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    };

    host.addEventListener('pointermove', onMove, { passive: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('pointermove', onMove));
  }
}
