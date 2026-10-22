import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { prefersReducedMotion } from './motion';

@Directive({
  selector: '[appReveal]',
})
export class RevealDirective {
  readonly appReveal = input<number | ''>('');

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      return;
    }

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
