import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

@Directive({
  selector: '[appGlide]',
})
export class GlideDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
        return;
      }

      let frame = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.place());
      };
      const resize = new ResizeObserver(schedule);
      resize.observe(this.host);
      const mutations = new MutationObserver(schedule);
      mutations.observe(this.host, { subtree: true, childList: true, attributeFilter: ['class'] });
      this.place();

      destroyRef.onDestroy(() => {
        cancelAnimationFrame(frame);
        resize.disconnect();
        mutations.disconnect();
      });
    });
  }

  private place(): void {
    const active = this.host.querySelector<HTMLElement>(':scope > .active');
    if (!active || active.offsetParent !== this.host) {
      this.host.classList.remove('glide-ready');
      return;
    }

    const style = this.host.style;
    style.setProperty('--glide-x', `${active.offsetLeft}px`);
    style.setProperty('--glide-y', `${active.offsetTop}px`);
    style.setProperty('--glide-w', `${active.offsetWidth}px`);
    style.setProperty('--glide-h', `${active.offsetHeight}px`);
    if (!this.host.classList.contains('glide-ready')) {
      this.host.classList.add('glide-ready');
    }
  }
}
