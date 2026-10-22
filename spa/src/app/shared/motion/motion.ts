const SPRING = 'linear(0, .006, .025 2.8%, .101 6.1%, .539 18.9%, .721 25.3%, .849 31.5%, .937 38.1%, '
  + '.968 41.8%, .991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001)';
const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';

export function springEasing(): string {
  return typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', SPRING) ? SPRING : EASE_OUT;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function characterTransitionName(key: string, part: 'crest' | 'name'): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `mplus-${part}-${(hash >>> 0).toString(36)}`;
}
