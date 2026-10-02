import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TapTooltipDirective } from './tap-tooltip.directive';

@Component({
  standalone: true,
  imports: [TapTooltipDirective],
  template: `
    <span class="first" appTapTooltip>first</span>
    <span class="second" appTapTooltip>second</span>
    <p class="outside">outside</p>
  `
})
class HostComponent {}

function pointer(type: 'pointerup' | 'pointerdown', target: Element, pointerType: string): void {
  // jsdom has no PointerEvent; a MouseEvent carrying pointerType is what the directive reads.
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

function tap(target: Element, pointerType = 'touch'): void {
  pointer('pointerdown', target, pointerType);
  pointer('pointerup', target, pointerType);
}

function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const isOpen = (selector: string) => element.querySelector(selector)!.classList.contains('tooltip-open');
  return { fixture, element, isOpen };
}

describe('TapTooltipDirective', () => {
  it('opens on a tap and closes on a second tap', () => {
    const { fixture, element, isOpen } = render();

    tap(element.querySelector('.first')!);
    fixture.detectChanges();
    expect(isOpen('.first')).toBe(true);

    tap(element.querySelector('.first')!);
    fixture.detectChanges();
    expect(isOpen('.first')).toBe(false);
  });

  it('closes when another tooltip or anything else is tapped, or on Escape', () => {
    const { fixture, element, isOpen } = render();

    tap(element.querySelector('.first')!);
    tap(element.querySelector('.second')!);
    fixture.detectChanges();
    expect([isOpen('.first'), isOpen('.second')]).toEqual([false, true]);

    tap(element.querySelector('.outside')!);
    fixture.detectChanges();
    expect(isOpen('.second')).toBe(false);

    tap(element.querySelector('.first')!);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(isOpen('.first')).toBe(false);
  });

  it('leaves mouse clicks to the hover styles', () => {
    const { fixture, element, isOpen } = render();

    tap(element.querySelector('.first')!, 'mouse');
    fixture.detectChanges();
    expect(isOpen('.first')).toBe(false);
  });
});
