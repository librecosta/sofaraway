import { expect, test } from '@playwright/test';

test('the gameplay rim and strip share the scored hue and pulse at the beat', async ({ page }) => {
  const sample = async (beat: number) => {
    await page.goto(`/?vol=elsewhere&t=${beat * 60 / 128}&q=low&align=1&dbg=1`);
    await expect(page.locator('#errbox')).toContainText('"phase":"playing"');
    return page.locator('#errbox').evaluate(el => JSON.parse(el.textContent!).scenicLights as {
      rim: number[]; strip: number[]; reduced: boolean;
    });
  };
  const dark = await sample(202.5);
  const bright = await sample(202);
  const firstColor = await sample(192);
  const norm = (rgb: number[]) => rgb.map(channel => channel / Math.max(...rgb));
  for (const light of [dark, bright, firstColor]) {
    norm(light.strip).forEach((channel, i) => expect(channel).toBeCloseTo(norm(light.rim)[i], 7));
  }
  expect(norm(firstColor.rim)).not.toEqual(norm(bright.rim));
  expect(Math.max(...bright.rim)).toBeGreaterThan(Math.max(...dark.rim));
  expect(Math.max(...bright.strip)).toBeGreaterThan(Math.max(...dark.strip));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const quietBeat = await sample(202);
  const quietOffbeat = await sample(202.5);
  expect(quietBeat.reduced).toBe(true);
  expect(Math.max(...quietBeat.rim)).toBeCloseTo(Math.max(...quietOffbeat.rim), 8);
  expect(Math.max(...quietBeat.strip)).toBeCloseTo(Math.max(...quietOffbeat.strip), 8);
});

test('Sightseeing shares the rendered corridor through context loss, retry and mode changes', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8090');
  await page.waitForFunction(() => !!window.b0Harness);
  const installed = await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'elsewhere', quality: 'low', mode: 'sightseeing', diagnostics: { fixedTime: null, autoplay: false,
      god: false, align: true, boost: false, mobileQuality: false, post: true, record: false, debug: false } });
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(42);
  });
  expect(installed.sharedPath).toBe(true);
  expect(installed.metrics.scenicLights?.zone).toBe('helical-wash');
  expect(installed.metrics.scenicLights!.fixtures).toBeGreaterThan(0);
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
  expect(restored.sharedPath).toBe(true);
  expect(restored.metrics.scenicLights).toEqual(installed.metrics.scenicLights);
  for (const key of ['geometries', 'textures', 'programs'] as const) expect(restored.metrics[key]).toBe(installed.metrics[key]);
  const repeated = await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(42);
  });
  expect(repeated.sharedPath).toBe(true);
  expect(repeated.metrics.scenicLights?.fixtures).toBe(installed.metrics.scenicLights?.fixtures);
  for (const key of ['geometries', 'textures', 'programs'] as const) expect(repeated.metrics[key]).toBe(installed.metrics[key]);
  const switched = await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    window.b0Harness.mode('standard');
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(42);
  });
  expect(switched.sharedPath).toBe(true);
  expect(switched.trackDistance).toBeGreaterThan(repeated.trackDistance + 250);
  expect(switched.metrics.scenicLights?.zone).toBe('helical-wash');
  expect(pageErrors).toEqual([]);
});
