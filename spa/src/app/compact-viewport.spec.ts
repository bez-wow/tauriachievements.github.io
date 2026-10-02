import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_VIEWPORT_QUERY, injectCompactViewport } from './compact-viewport';

@Component({ standalone: true, template: '' })
class ViewportHostComponent {
  readonly isCompact = injectCompactViewport();
}

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches,
    media: COMPACT_VIEWPORT_QUERY,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener))
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));

  return {
    query,
    change: (nextMatches: boolean) => listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent))
  };
}

describe('injectCompactViewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the phone-width media query as the screen changes', () => {
    const media = stubMatchMedia(true);
    const fixture = TestBed.createComponent(ViewportHostComponent);

    expect(window.matchMedia).toHaveBeenCalledWith(COMPACT_VIEWPORT_QUERY);
    expect(fixture.componentInstance.isCompact()).toBe(true);

    media.change(false);
    expect(fixture.componentInstance.isCompact()).toBe(false);
  });

  it('stops listening when its component is destroyed', () => {
    const media = stubMatchMedia(false);
    const fixture = TestBed.createComponent(ViewportHostComponent);

    fixture.destroy();
    expect(media.query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('treats a browser without matchMedia as a wide screen', () => {
    vi.stubGlobal('matchMedia', undefined);
    const fixture = TestBed.createComponent(ViewportHostComponent);

    expect(fixture.componentInstance.isCompact()).toBe(false);
  });
});
