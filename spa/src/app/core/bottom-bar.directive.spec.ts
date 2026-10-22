import { describe, expect, it } from 'vitest';
import { bottomBarHeight } from './bottom-bar.directive';

function bar(height: number, bottom: string): HTMLElement {
  const element = document.createElement('div');
  element.style.position = 'fixed';
  element.style.bottom = bottom;
  Object.defineProperty(element, 'offsetHeight', { value: height });
  document.body.append(element);
  return element;
}

describe('bottomBarHeight', () => {
  it('reserves the bar and the gap below it', () => {
    expect(bottomBarHeight(bar(96, '16px'))).toBe(112);
  });

  it('rounds up, so a fractional bar never overlaps the page end', () => {
    expect(bottomBarHeight(bar(95.5, '0px'))).toBe(96);
  });

  it('ignores an unset bottom', () => {
    expect(bottomBarHeight(bar(60, 'auto'))).toBe(60);
  });
});
