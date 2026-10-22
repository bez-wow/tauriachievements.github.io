import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: '[appSpotlight]',
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
