import { describe, it, expect } from 'vitest';
import { pageCount, pageSlice } from './pager';

describe('pageCount', () => {
  it('always has at least one page', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(40, 20)).toBe(2);
    expect(pageCount(41, 20)).toBe(3);
  });
});

describe('pageSlice', () => {
  it('returns the items on a page, and a short last page', () => {
    const items = [1, 2, 3, 4, 5];

    expect(pageSlice(items, 1, 2)).toEqual([1, 2]);
    expect(pageSlice(items, 2, 2)).toEqual([3, 4]);
    expect(pageSlice(items, 3, 2)).toEqual([5]);
  });
});
