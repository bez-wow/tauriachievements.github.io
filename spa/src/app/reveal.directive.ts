import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { prefersReducedMotion } from './motion';

/**
 * Plays an entrance animation once, when its host first scrolls into view. The host gets
 * `data-reveal="pending"` straight away (the stylesheet hides what is about to animate), `"in"` when
 * its top is on screen, and loses the attribute once the animation has had time to finish, so a
 * later re-render or re-order doesn't play it again. The component's stylesheet holds the animation
 * itself, under `[data-reveal=pending]` and `[data-reveal=in]`.
 *
 * Does nothing (everything simply shows) for reduced motion or without IntersectionObserver.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true
})
export class RevealDirective {
  /** How long the entrance runs, in ms, staggered children included. */
  readonly appReveal = input<number | ''>('');

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      return;
    }

    // Set before the first paint, so nothing shows at full size and then jumps back to grow.
    this.host.setAttribute('data-reveal', 'pending');
    const destroyRef = inject(DestroyRef);
    let timer: ReturnType<typeof setTimeout> | undefined;

    afterNextRender(() => {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        this.host.setAttribute('data-reveal', 'in');
        timer = setTimeout(() => this.host.removeAttribute('data-reveal'), this.appReveal() || 1600);
      }, { rootMargin: '0px 0px -8% 0px' });
      observer.observe(this.host);

      destroyRef.onDestroy(() => {
        observer.disconnect();
        clearTimeout(timer);
      });
    });
  }
}
