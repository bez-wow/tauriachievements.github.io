import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.visual.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  outputDir: './e2e/.results',
  fullyParallel: true,
  workers: 4,
  timeout: 120_000,
  reporter: [['list'], ['html', { outputFolder: './e2e/.report', open: 'never' }]],
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' }
  },
  use: {
    baseURL: 'http://localhost:4300',
    browserName: 'chromium',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Europe/Budapest',
    reducedMotion: 'reduce'
  },
  webServer: {
    command: 'node e2e/serve-dist.mjs',
    url: 'http://localhost:4300',
    reuseExistingServer: false
  }
});
