import { Directive, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { prefersReducedMotion, springEasing } from './motion';

const DURATION = 650;
/** Each moved child starts this much after the one before it. */
const STAGGER = 14;

interface Point { x: number; y: number }

/**
 * Animates a re-ordered and re-sized chart into its new shape instead of letting it jump (FLIP):
 * children marked `data-flip="key"` slide from where they were to where they are now, and elements
 * marked `data-flip-height="key"` grow or shrink from their old height. Pass something that changes
 * with the content as `appFlip`; it runs after each render in which that changed. The first render
 * only records where everything is.
 *
 * All measuring happens before any animation starts, so the page lays out a few times per change
 * rather than once per bar.
 */
@Directive({
  selector: '[appFlip]',
  standalone: true
})
export class FlipDirective {
  readonly appFlip = input<unknown>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private positions = new Map<string, Point>();
  private heights = new Map<string, number>();
  private readonly running = new WeakMap<HTMLElement, Animation>();
  private recorded = false;

  constructor() {
    afterRenderEffect(() => {
      this.appFlip();
      this.flip();
    });
  }

  private flip(): void {
    const animate = this.recorded && !prefersReducedMotion() && typeof this.host.animate === 'function';
    this.recorded = true;

    // offsetLeft/Top ignore transforms, so a slide still running doesn't throw the positions off.
    const items = [...this.host.querySelectorAll<HTMLElement>('[data-flip]')].map(element => ({
      element,
      key: element.dataset['flip'] ?? '',
      now: { x: element.offsetLeft, y: element.offsetTop }
    }));

    // A bar still moving from the last change starts from where it is now, not where it was heading.
    const bars = [...this.host.querySelectorAll<HTMLElement>('[data-flip-height]')].map(element => {
      const key = element.dataset['flipHeight'] ?? '';
      return { element, key, from: this.running.has(element) ? element.offsetHeight : this.heights.get(key), to: 0 };
    });
    for (const bar of bars) {
      this.running.get(bar.element)?.cancel();
      this.running.delete(bar.element);
    }
    for (const bar of bars) {
      bar.to = bar.element.offsetHeight;
    }

    if (animate) {
      const easing = springEasing();
      let moved = 0;
      for (const { element, key, now } of items) {
        const before = this.positions.get(key);
        if (before && (before.x !== now.x || before.y !== now.y)) {
          element.animate(
            [{ transform: `translate(${before.x - now.x}px, ${before.y - now.y}px)` }, { transform: 'none' }],
            { duration: DURATION, easing, delay: moved++ * STAGGER, fill: 'backwards' });
        }
      }
      for (const { element, from, to } of bars) {
        if (from !== undefined && from !== to) {
          const animation = element.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: DURATION, easing });
          this.running.set(element, animation);
          animation.onfinish = () => this.running.delete(element);
        }
      }
    }

    this.positions = new Map(items.map(({ key, now }) => [key, now]));
    this.heights = new Map(bars.map(({ key, to }) => [key, to]));
  }
}
