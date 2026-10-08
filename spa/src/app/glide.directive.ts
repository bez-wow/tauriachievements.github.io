import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Slides one highlight between the options of a switch or a picker, to whichever child has the
 * `active` class, instead of the highlight jumping. It sets --glide-x, --glide-y, --glide-w and
 * --glide-h on the host (the active child's box inside the host's padding box) and the class
 * `glide-ready`; the component's stylesheet draws the highlight from them (the glide-* mixins in
 * _mythic-plus-shared.scss). Until it's placed, and without ResizeObserver, the active child keeps
 * its own highlight, so nothing looks different.
 */
@Directive({
  selector: '[appGlide]',
  standalone: true
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
      // Size changes (wrapping, a font arriving, rotation) and a different option turning active.
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
    // Hidden (no layout), or nothing picked: drop the highlight. It comes back without sliding in.
    if (!active || active.offsetParent !== this.host) {
      this.host.classList.remove('glide-ready');
      return;
    }

    // offset* ignore transforms, so a switch inside something that is animating still measures right.
    const style = this.host.style;
    style.setProperty('--glide-x', `${active.offsetLeft}px`);
    style.setProperty('--glide-y', `${active.offsetTop}px`);
    style.setProperty('--glide-w', `${active.offsetWidth}px`);
    style.setProperty('--glide-h', `${active.offsetHeight}px`);
    // Checked first: re-adding a class it already has would still notify the MutationObserver.
    if (!this.host.classList.contains('glide-ready')) {
      this.host.classList.add('glide-ready');
    }
  }
}
