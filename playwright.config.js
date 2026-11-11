import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'a0.spec.js',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:8088',
    channel: process.env.A0_BROWSER_CHANNEL || undefined,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    viewport: { width: 960, height: 540 },
  },
  webServer: {
    command: 'python -m http.server 8088 --bind 127.0.0.1',
    cwd: process.env.A0_APP_ROOT,
    url: 'http://127.0.0.1:8088',
    stderr: 'ignore',
  },
});
