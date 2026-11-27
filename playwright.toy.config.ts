import { defineConfig } from '@playwright/test';

const release = 'http://127.0.0.1:4174';
const development = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: './tests/toy',
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results/toy',
  use: {
    baseURL: release,
    channel: process.env.TOY_CHROMIUM_CHANNEL || undefined,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    viewport: { width: 960, height: 540 },
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'node tools/serve-static.mjs build/toy 4174 /toy/sofaraway/', url: release + '/toy/sofaraway/index.html' },
    { command: 'node node_modules/vite/bin/vite.js --config vite.toy.config.ts', url: development, reuseExistingServer: !process.env.CI },
  ],
});
