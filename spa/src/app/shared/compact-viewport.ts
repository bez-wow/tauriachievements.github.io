import { DestroyRef, Signal, inject, signal } from '@angular/core';

export const COMPACT_VIEWPORT_QUERY = '(max-width: 640px)';

export function injectCompactViewport(mediaQuery = COMPACT_VIEWPORT_QUERY): Signal<boolean> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return signal(false).asReadonly();
  }

  const query = window.matchMedia(mediaQuery);
  const isCompact = signal(query.matches);
  const onChange = (event: MediaQueryListEvent) => isCompact.set(event.matches);

  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));

  return isCompact.asReadonly();
}
