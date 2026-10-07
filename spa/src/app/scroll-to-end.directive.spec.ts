import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ScrollToEndDirective } from './scroll-to-end.directive';

@Component({
  standalone: true,
  imports: [ScrollToEndDirective],
  template: `<div class="scroller" [appScrollToEnd]="columns()"></div>`
})
class HostComponent {
  readonly columns = signal(10);
}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  const scroller: HTMLElement = fixture.nativeElement.querySelector('.scroller');
  // jsdom does no layout: fake a 1000 px wide content in a 300 px box.
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, get: () => 1000 });
  return { fixture, scroller };
}

describe('ScrollToEndDirective', () => {
  it('opens scrolled to the end', async () => {
    const { fixture, scroller } = render();
    await fixture.whenStable();

    expect(scroller.scrollLeft).toBe(1000);
  });

  it('scrolls to the end again when the bound value changes, not before', async () => {
    const { fixture, scroller } = render();
    await fixture.whenStable();

    scroller.scrollLeft = 120;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(scroller.scrollLeft).toBe(120);

    fixture.componentInstance.columns.set(11);
    await fixture.whenStable();
    expect(scroller.scrollLeft).toBe(1000);
  });
});
