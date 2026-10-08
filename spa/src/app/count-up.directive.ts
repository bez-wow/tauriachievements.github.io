import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { CountText, easeOutExpo, formatCountText, parseCountText } from './count-up';
import { prefersReducedMotion } from './motion';

/**
 * Writes a number into its host by counting to it: "41,401", "90%", "+20", "78 runs". The first
 * value counts up from zero; a later one counts on from the number shown, so switching Season /
 * This week rolls the numbers instead of swapping them. Text without a number is written as it
 * is, and so is a rank ("#3"): counting one up from #0 would read as passing through better ranks.
 * The host's own content is replaced, so leave it empty in the template.
 *
 * It writes the DOM straight from requestAnimationFrame, so counting renders nothing in Angular.
 */
@Directive({
  selector: '[appCountUp]',
  standalone: true
})
export class CountUpDirective {
  readonly appCountUp = input.required<string>();
  /** Wait before counting, in ms, to stagger a row of numbers. */
  readonly countUpDelay = input(0);
  readonly countUpDuration = input(900);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  /** The number on screen right now; undefined before the first value. */
  private shown: number | undefined;
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const text = this.appCountUp();
      untracked(() => this.count(text));
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private count(text: string): void {
    this.stop();
    const target = parseCountText(text);
    if (!target || target.prefix.includes('#') || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.write(text, target?.value);
      return;
    }

    const first = this.shown === undefined;
    const from = this.shown ?? 0;
    if (from === target.value) {
      this.write(text, target.value);
      return;
    }

    const duration = first ? this.countUpDuration() : Math.min(500, this.countUpDuration());
    const run = () => {
      let start: number | undefined;
      const step = (now: number) => {
        start ??= now;
        const progress = Math.min(1, (now - start) / duration);
        const value = from + (target.value - from) * easeOutExpo(progress);
        if (progress < 1) {
          this.write(formatCountText(target, round(value, target)), value);
          this.frame = requestAnimationFrame(step);
        } else {
          this.write(text, target.value);
        }
      };
      this.frame = requestAnimationFrame(step);
    };

    // Starts on zero, so the number doesn't show in full and then drop back while it waits.
    if (first) {
      this.write(formatCountText(target, 0), 0);
    }
    const delay = first ? this.countUpDelay() : 0;
    if (delay > 0) {
      this.timer = setTimeout(run, delay);
    } else {
      run();
    }
  }

  private write(text: string, value: number | undefined): void {
    this.host.textContent = text;
    this.shown = value;
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
  }
}

/** To the target's decimals, so a whole number never shows a fraction on its way. */
function round(value: number, shape: CountText): number {
  const scale = 10 ** shape.decimals;
  return Math.round(value * scale) / scale;
}
