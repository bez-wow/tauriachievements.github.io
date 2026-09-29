import { DestroyRef, Signal, inject, signal } from '@angular/core';

export interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
  isReleased: boolean;
}

/** Zero-padded days, hours, minutes and seconds left until `targetMs`. */
export function countdownTo(targetMs: number, nowMs: number): CountdownParts {
  const remaining = targetMs - nowMs;

  if (!(remaining > 0)) {
    return { days: '00', hours: '00', minutes: '00', seconds: '00', isReleased: true };
  }

  const totalSeconds = Math.floor(remaining / 1000);
  return {
    days: pad(Math.floor(totalSeconds / 86400)),
    hours: pad(Math.floor(totalSeconds / 3600) % 24),
    minutes: pad(Math.floor(totalSeconds / 60) % 60),
    seconds: pad(totalSeconds % 60),
    isReleased: false
  };
}

/**
 * A signal that ticks once a second until `targetMs`, then stops. Call it from an injection context
 * (a field initializer or constructor); the timer is cleared when the owner is destroyed.
 */
export function createCountdown(targetMs: number): Signal<CountdownParts> {
  const destroyRef = inject(DestroyRef);
  const state = signal(countdownTo(targetMs, Date.now()));

  if (!state().isReleased) {
    const timer = setInterval(() => {
      const next = countdownTo(targetMs, Date.now());
      state.set(next);

      if (next.isReleased) {
        clearInterval(timer);
      }
    }, 1000);
    destroyRef.onDestroy(() => clearInterval(timer));
  }

  return state.asReadonly();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
