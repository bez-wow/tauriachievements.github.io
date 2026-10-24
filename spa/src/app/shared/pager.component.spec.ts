import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PagerComponent } from './pager.component';

async function renderPager(inputs: { page: number; pages: number; count?: string; label?: string; scrollTarget?: HTMLElement }) {
  await TestBed.configureTestingModule({ imports: [PagerComponent] }).compileComponents();
  const fixture = TestBed.createComponent(PagerComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  const element: HTMLElement = fixture.nativeElement;
  const emitted: number[] = [];
  fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));
  const buttons = [...element.querySelectorAll('button')];
  const button = (label: string) => buttons.find((candidate) => candidate.textContent?.includes(label))!;
  return { element, emitted, button };
}

describe('PagerComponent', () => {
  it('shows First, Prev, Next and Last, and disables the ends it is on', async () => {
    const { element, button } = await renderPager({ page: 1, pages: 3 });

    expect([...element.querySelectorAll('button')].map((b) => b.textContent?.replace(/[«‹›»]/g, '').trim()))
      .toEqual(['First', 'Prev', 'Next', 'Last']);
    expect(button('First').disabled).toBe(true);
    expect(button('Prev').disabled).toBe(true);
    expect(button('Next').disabled).toBe(false);
    expect(button('Last').disabled).toBe(false);
  });

  it('disables every button when there is one page', async () => {
    const { element } = await renderPager({ page: 1, pages: 1 });

    expect([...element.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });

  it('asks for the first, previous, next and last page', async () => {
    const { emitted, button } = await renderPager({ page: 3, pages: 7 });

    button('First').click();
    button('Prev').click();
    button('Next').click();
    button('Last').click();

    expect(emitted).toEqual([1, 2, 4, 7]);
  });

  it('shows the page and the count only when given a count', async () => {
    const withCount = await renderPager({ page: 2, pages: 41, count: '2,034 characters', label: 'Leaderboard pages' });

    expect(withCount.element.querySelector('.pager-status')?.textContent?.trim()).toBe('Page 2 of 41 · 2,034 characters');
    expect(withCount.element.querySelector('nav')?.getAttribute('aria-label')).toBe('Leaderboard pages');

    TestBed.resetTestingModule();
    const withoutCount = await renderPager({ page: 2, pages: 41 });

    expect(withoutCount.element.querySelector('.pager-status')).toBeNull();
  });

  it('scrolls its target into view after a page change', async () => {
    const scrollTarget = document.createElement('div');
    const scrollIntoView = vi.fn();
    scrollTarget.scrollIntoView = scrollIntoView;
    const { button } = await renderPager({ page: 2, pages: 3, scrollTarget });

    button('Next').click();

    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
  });
});
