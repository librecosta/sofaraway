import { defineConfig, devices } from '@playwright/test';

const chromium = {
  channel: process.env.COMPAT_CHROMIUM_CHANNEL || undefined,
  launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] },
};

export default defineConfig({
  testDir: './tests/browser/compat',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 6_000 },
  use: { baseURL: 'http://127.0.0.1:8092', viewport: { width: 960, height: 540 }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: '**/mobile.spec.ts', use: { browserName: 'chromium', ...chromium } },
    { name: 'firefox', testIgnore: '**/mobile.spec.ts', use: { browserName: 'firefox' } },
    { name: 'webkit', testIgnore: '**/mobile.spec.ts', use: { browserName: 'webkit' } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], ...chromium } },
    // WinCairo's high-DPR compositing is exercised separately in mobile.spec.ts.
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], deviceScaleFactor: 2 } },
  ],
  webServer: [
    { command: 'node tools/serve-static.mjs build/client 8092', url: 'http://127.0.0.1:8092' },
    { command: 'node tools/serve-static.mjs build/harness 8093', url: 'http://127.0.0.1:8093' },
  ],
});
