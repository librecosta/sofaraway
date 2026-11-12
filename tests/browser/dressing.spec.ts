import { expect, test } from '@playwright/test';

test('the gameplay rims and corner strips breathe together in one chapter color', async ({ page }) => {
  const sample = async (beat: number) => {
    await page.goto(`/?vol=elsewhere&t=${beat * 60 / 128}&q=low&align=1&dbg=1`);
    await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
    return page.locator('#errbox').evaluate(el => JSON.parse(el.textContent!).scenicLights as {
      rim: number[]; strip: number[];
    });
  };
  const dark = await sample(4);
  const bright = await sample(6);
  const norm = (rgb: number[]) => rgb.map(channel => channel / Math.max(...rgb));
  for (const candidate of [dark.strip, bright.rim, bright.strip]) {
    norm(candidate).forEach((channel, i) => expect(channel).toBeCloseTo(norm(dark.rim)[i], 7));
  }
  expect(Math.max(...bright.rim)).toBeGreaterThan(Math.max(...dark.rim));
  expect(Math.max(...bright.strip)).toBeGreaterThan(Math.max(...dark.strip));
});

test('mounted assemblies rebuild in place after context loss and on retry', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8090');
  await page.waitForFunction(() => !!window.b0Harness);
  const installed = await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'elsewhere', quality: 'low' });
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(5.6);
  });
  expect(installed.metrics.dressing).toBeGreaterThan(0);
  expect(Object.keys(installed.metrics.scenicInstances!)).toEqual([
    'overhead-assembly', 'ventilation-assembly', 'utility-conduits', 'service-bay', 'holographic-service-door',
  ]);
  expect(await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    canvas.addEventListener('kit-restore', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error?.kind)).toBe('graphics');
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('kit-restore')));
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error)).toBeNull();
  expect(await page.evaluate(() => window.b0Harness.snapshot().phase)).toBe('paused');
  const restored = await page.evaluate(() => window.b0Harness.branchState());
  expect(restored.metrics.scenicInstances).toEqual(installed.metrics.scenicInstances);
  expect(restored.metrics.dressing).toBe(installed.metrics.dressing);
  const repeated = await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(5.6);
  });
  expect(repeated.metrics.scenicInstances).toEqual(installed.metrics.scenicInstances);
  expect(pageErrors).toEqual([]);
});
