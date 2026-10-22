import { expect, test } from '@playwright/test';
import { openPage } from './page-setup';
import { PHONE_WIDTHS, SIDEWAYS_BY_DESIGN, VISUAL_PAGES } from './visual-pages';

interface Finding {
  readonly rule: 'scrolls-sideways' | 'cut-off' | 'text-cut' | 'covered-at-page-end';
  readonly where: string;
  readonly detail: string;
}

function findLayoutProblems(sidewaysByDesign: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const viewportWidth = document.documentElement.clientWidth;
  const isShown = (element: Element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return box.width > 1 && box.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.01;
  };
  const describe = (element: Element) => {
    let host: Element | null = element;
    while (host && !host.tagName.startsWith('APP-')) {
      host = host.parentElement;
    }
    const classes = typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${host ? `${host.tagName.toLowerCase()} ` : ''}${element.tagName.toLowerCase()}${classes}`;
  };
  const textOf = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const clips = (style: CSSStyleDeclaration) => /(hidden|clip)/.test(style.overflowX);
  const scrolls = (style: CSSStyleDeclaration) => /(auto|scroll)/.test(style.overflowX);

  for (const element of Array.from(document.querySelectorAll('body *'))) {
    if (!isShown(element)) {
      continue;
    }
    const style = getComputedStyle(element);
    if (scrolls(style) && element.scrollWidth > element.clientWidth + 2 && !sidewaysByDesign.some(selector => element.matches(selector))) {
      findings.push({ rule: 'scrolls-sideways', where: describe(element), detail: `${element.scrollWidth} px in ${element.clientWidth} px: "${textOf(element)}"` });
    }

    const isLeaf = element.children.length === 0 || /^(IMG|SVG|CANVAS|BUTTON|A|INPUT|SELECT)$/i.test(element.tagName);
    if (!isLeaf) {
      continue;
    }
    if (element.children.length === 0 && textOf(element) && clips(style) && element.scrollWidth > element.clientWidth + 2 && style.textOverflow !== 'ellipsis') {
      findings.push({ rule: 'text-cut', where: describe(element), detail: `"${textOf(element)}"` });
    }

    const box = element.getBoundingClientRect();
    for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
      const ancestorStyle = getComputedStyle(ancestor);
      if (scrolls(ancestorStyle)) {
        break;
      }
      if (!clips(ancestorStyle) && ancestor !== document.body) {
        continue;
      }
      const frame = ancestor === document.body ? { left: 0, right: viewportWidth, width: viewportWidth, height: 2 } : ancestor.getBoundingClientRect();
      const croppedOnBothSides = box.left < frame.left && box.right > frame.right;
      const outside = Math.max(box.right - frame.right, frame.left - box.left);
      if (frame.width > 2 && frame.height > 1 && !croppedOnBothSides && outside > 3 && ancestorStyle.textOverflow !== 'ellipsis') {
        findings.push({ rule: 'cut-off', where: describe(element), detail: `"${textOf(element)}" runs ${Math.round(outside)} px past ${describe(ancestor)}` });
      }
      break;
    }
  }
  return findings;
}

function findControlsCoveredAtPageEnd(): Finding[] {
  const findings: Finding[] = [];
  const bottomLayers = Array.from(document.querySelectorAll('body *')).filter(element => {
    const style = getComputedStyle(element);
    const anchoredToBottom = style.position === 'fixed' ? element.getBoundingClientRect().top > innerHeight / 2 : style.position === 'sticky' && style.top === 'auto' && style.bottom !== 'auto';
    return anchoredToBottom && element.tagName !== 'DIALOG';
  });
  for (const control of Array.from(document.querySelectorAll('a[href], button, select, input, [role=button], [role=tab]'))) {
    const box = control.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.bottom < 0 || box.top > innerHeight || bottomLayers.some(layer => layer.contains(control))) {
      continue;
    }
    const hit = document.elementFromPoint(box.left + box.width / 2, Math.min(box.top + box.height / 2, innerHeight - 1));
    const layer = hit ? bottomLayers.find(candidate => candidate.contains(hit)) : undefined;
    if (layer && !control.contains(hit)) {
      findings.push({ rule: 'covered-at-page-end', where: (control.textContent ?? control.getAttribute('aria-label') ?? '').trim().slice(0, 30), detail: `under ${layer.tagName.toLowerCase()}.${String(layer.className).split(' ')[0]}` });
    }
  }
  return findings;
}

for (const width of PHONE_WIDTHS) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });

    for (const visualPage of VISUAL_PAGES.filter(entry => !entry.fail && !entry.hold && entry.only !== 'desktop')) {
      test(visualPage.name, async ({ page }) => {
        await openPage(page, visualPage);
        const problems = await page.evaluate(findLayoutProblems, SIDEWAYS_BY_DESIGN.map(entry => entry.selector));
        if (!visualPage.clicks?.length) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.waitForTimeout(300);
          problems.push(...(await page.evaluate(findControlsCoveredAtPageEnd)));
        }
        const unique = [...new Map(problems.map(problem => [`${problem.rule} ${problem.where}`, problem])).values()];
        expect(unique.map(problem => `${problem.rule}: ${problem.where} | ${problem.detail}`), `${visualPage.path} at ${width} px`).toEqual([]);
      });
    }
  });
}
