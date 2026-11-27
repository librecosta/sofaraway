import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/release',
  workers: 1,
  outputDir: 'test-results/release',
  use: {
    baseURL: 'http://127.0.0.1:8100',
    channel: process.env.RELEASE_CHROMIUM_CHANNEL || undefined,
    viewport: { width: 960, height: 540 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tools/serve-static.mjs build/client 8100',
    url: 'http://127.0.0.1:8100',
  },
});
