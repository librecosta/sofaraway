import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/sync',
  workers: 2,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results/sync',
  use: { baseURL: 'http://127.0.0.1:8098', viewport: { width: 640, height: 360 }, screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.env.SYNC_CHROMIUM_CHANNEL || undefined } },
    { name: 'firefox', testIgnore: '**/full.spec.ts', use: { browserName: 'firefox' } },
    { name: 'webkit', testMatch: '**/lifecycle.spec.ts', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node tools/serve-static.mjs build/harness 8098', url: 'http://127.0.0.1:8098' },
});
