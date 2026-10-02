import { DestroyRef, Signal, inject, signal } from '@angular/core';

/** Phone-sized screens, where pages switch to their one-column layouts. */
export const COMPACT_VIEWPORT_QUERY = '(max-width: 640px)';

/**
 * Whether the screen is phone-sized, kept up to date when it is rotated or resized.
 * Call it in an injection context (a field initializer or constructor).
 */
export function injectCompactViewport(): Signal<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return signal(false).asReadonly();
  }

  const query = window.matchMedia(COMPACT_VIEWPORT_QUERY);
  const isCompact = signal(query.matches);
  const onChange = (event: MediaQueryListEvent) => isCompact.set(event.matches);

  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));

  return isCompact.asReadonly();
}
