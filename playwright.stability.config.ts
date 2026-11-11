import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const reference = process.env.STABILITY_REFERENCE_DIR;
if (reference && ['client', 'harness'].some(dir => !existsSync(resolve(reference, dir, 'index.html')))) {
  throw new Error('STABILITY_REFERENCE_DIR must contain built client and harness directories outside the current build directory.');
}
const cache = { STABILITY_HTTP_CACHE: '1' };

export default defineConfig({
  testDir: './tests/stability',
  workers: 1,
  timeout: 360_000,
  outputDir: 'test-results/stability',
  use: { channel: process.env.STABILITY_CHROMIUM_CHANNEL || undefined, screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node tools/serve-static.mjs build/client 8094', url: 'http://127.0.0.1:8094', env: cache },
    { command: 'node tools/serve-static.mjs build/harness 8095', url: 'http://127.0.0.1:8095' },
    ...(reference ? [
      { command: 'node tools/serve-static.mjs --stability-client 8096', url: 'http://127.0.0.1:8096', env: cache },
      { command: 'node tools/serve-static.mjs --stability-harness 8097', url: 'http://127.0.0.1:8097' },
    ] : []),
  ],
});
