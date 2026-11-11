import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/compat/**',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:8089',
    channel: process.env.A0_BROWSER_CHANNEL || undefined,
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    viewport: { width: 960, height: 540 },
  },
  webServer: [
    { command: 'node tools/serve-static.mjs build/client 8089', url: 'http://127.0.0.1:8089' },
    { command: 'node tools/serve-static.mjs build/harness 8090', url: 'http://127.0.0.1:8090' },
    { command: 'node node_modules/@react-router/dev/bin.cjs dev --host 127.0.0.1 --port 8091 --strictPort',
      url: 'http://127.0.0.1:8091', reuseExistingServer: !process.env.CI, stdout: 'pipe' },
  ],
});
