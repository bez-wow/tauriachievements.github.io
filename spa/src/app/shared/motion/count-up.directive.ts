import { DestroyRef, Directive, ElementRef, effect, inject, input, untracked } from '@angular/core';
import { CountText, easeOutExpo, formatCountText, parseCountText } from './count-up';
import { prefersReducedMotion } from './motion';

@Directive({
  selector: '[appCountUp]',
})
export class CountUpDirective {
  readonly appCountUp = input.required<string>();
  readonly countUpDelay = input(0);
  readonly countUpDuration = input(900);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
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

function round(value: number, shape: CountText): number {
  const scale = 10 ** shape.decimals;
  return Math.round(value * scale) / scale;
}
