import { Page, expect, test } from '@playwright/test';
import { openPage } from './page-setup';
import { VISUAL_PAGES, VISUAL_VIEWPORTS } from './visual-pages';

async function expectPageInSlices(page: Page, name: string): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()?.height ?? 800;
  const slices = Math.max(1, Math.ceil(height / step));
  for (let slice = 0; slice < slices; slice++) {
    await page.evaluate(top => window.scrollTo(0, top), slice * step);
    await expect.soft(page).toHaveScreenshot(`${name}-${String(slice).padStart(2, '0')}.png`);
  }
}

for (const viewport of VISUAL_VIEWPORTS) {
  test.describe(viewport.name, () => {
    const isPhone = viewport.width < 640;
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: isPhone,
      hasTouch: isPhone
    });

    for (const visualPage of VISUAL_PAGES.filter(entry => !entry.only || entry.only === viewport.name)) {
      test(visualPage.name, async ({ page }) => {
        await openPage(page, visualPage);
        await expectPageInSlices(page, `${visualPage.name}-${viewport.name}`);
      });
    }
  });
}
