import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconTipSpell, IconTipsComponent } from './icon-tips.component';

@Component({
  standalone: true,
  imports: [IconTipsComponent],
  template: `
    <app-icon-tips [spells]="spells">
      <a class="talent" data-tip="Chi Burst" data-tip-spell="123986"></a>
      <a class="trinket" data-tip="Memento" data-tip-note="Item level 860"></a>
    </app-icon-tips>
  `
})
class HostComponent {
  spells: ReadonlyMap<number, IconTipSpell> = new Map([
    [123986, { details: '40 yd range · 1 sec cast', description: 'Hurls a torrent of Chi energy.' }]
  ]);
}

function hover(target: Element): void {
  const event = new MouseEvent('pointerover', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  const text = (selector: string) => element.querySelector(selector)!.textContent;
  return { element, text };
}

describe('IconTipsComponent', () => {
  it("adds a spell's details and description under its name", async () => {
    const { element, text } = await render();

    hover(element.querySelector('.talent')!);

    expect(element.querySelector('.icon-tip')!.classList.contains('shown')).toBe(true);
    expect([text('.icon-tip b'), text('.icon-tip-details'), text('.icon-tip-description')])
      .toEqual(['Chi Burst', '40 yd range · 1 sec cast', 'Hurls a torrent of Chi energy.']);
  });

  it('clears them for an icon without a spell', async () => {
    const { element, text } = await render();

    hover(element.querySelector('.talent')!);
    hover(element.querySelector('.trinket')!);

    expect([text('.icon-tip b'), text('.icon-tip-note'), text('.icon-tip-details'), text('.icon-tip-description')])
      .toEqual(['Memento', 'Item level 860', '', '']);
  });
});
