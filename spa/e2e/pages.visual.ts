import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Page, Route, expect, test } from '@playwright/test';
import { VISUAL_PAGES, VISUAL_VIEWPORTS, VisualPage } from './visual-pages';

const FIXED_TIME = new Date('2026-10-22T12:00:00Z');
const EXTERNAL_CACHE_DIR = join(__dirname, '.cache', 'external');
const BLOCKED_HOSTS = ['googletagmanager.com', 'google-analytics.com'];

interface CachedResponse {
  readonly status: number;
  readonly contentType: string;
}

const inFlight = new Map<string, Promise<boolean>>();

function writeAtomically(path: string, data: string | Buffer): void {
  mkdirSync(EXTERNAL_CACHE_DIR, { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(temporaryPath, data);
  renameSync(temporaryPath, path);
}

function cachedFetch(url: string, route: Route, bodyPath: string, metaPath: string): Promise<boolean> {
  let pending = inFlight.get(url);
  if (!pending) {
    pending = fetchIntoCache(route, bodyPath, metaPath).finally(() => inFlight.delete(url));
    inFlight.set(url, pending);
  }
  return pending;
}

async function fetchIntoCache(route: Route, bodyPath: string, metaPath: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await route.fetch({ timeout: 20_000 });
      if (response.status() >= 500 || response.status() === 429) {
        throw new Error(`HTTP ${response.status()}`);
      }
      const cached: CachedResponse = { status: response.status(), contentType: response.headers()['content-type'] ?? '' };
      writeAtomically(bodyPath, await response.body());
      writeAtomically(metaPath, JSON.stringify(cached));
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  return false;
}

async function serveExternalFromCache(page: Page): Promise<void> {
  await page.route(url => url.hostname !== 'localhost', async route => {
    const url = route.request().url();
    if (BLOCKED_HOSTS.some(host => new URL(url).hostname.endsWith(host))) {
      await route.abort();
      return;
    }

    const bodyPath = join(EXTERNAL_CACHE_DIR, createHash('sha1').update(url).digest('hex'));
    const metaPath = `${bodyPath}.json`;
    if (!existsSync(metaPath) && !(await cachedFetch(url, route, bodyPath, metaPath))) {
      console.warn(`External request failed: ${url}`);
      await route.abort();
      return;
    }

    const cached = JSON.parse(readFileSync(metaPath, 'utf8')) as CachedResponse;
    await route.fulfill({ status: cached.status, contentType: cached.contentType, body: readFileSync(bodyPath) });
  });
}

async function interceptData(page: Page, visualPage: VisualPage): Promise<void> {
  const matches = (patterns: readonly string[] | undefined) => (url: URL) =>
    url.hostname === 'localhost' && (patterns ?? []).some(pattern => new RegExp(pattern).test(url.pathname));
  if (visualPage.fail) {
    await page.route(matches(visualPage.fail), route => route.fulfill({ status: 500, body: '' }));
  }
  if (visualPage.hold) {
    await page.route(matches(visualPage.hold), () => new Promise<void>(() => undefined));
  }
}

async function settle(page: Page, visualPage?: VisualPage): Promise<void> {
  if (visualPage?.hold) {
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    return;
  }
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(image => {
    (image as HTMLImageElement).loading = 'eager';
  }));
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete), undefined, { timeout: 30_000 });
  await page.evaluate(() => Promise.all(Array.from(document.images).map(image => image.decode().catch(() => undefined))));
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
}

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
        await page.clock.setFixedTime(FIXED_TIME);
        await serveExternalFromCache(page);
        await interceptData(page, visualPage);
        await page.goto(visualPage.path);
        await settle(page, visualPage);
        for (const selector of visualPage.clicks ?? []) {
          await page.locator(selector).click();
          await page.waitForTimeout(400);
          await settle(page);
        }
        await expectPageInSlices(page, `${visualPage.name}-${viewport.name}`);
      });
    }
  });
}
