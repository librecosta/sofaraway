import { expect, test } from '@playwright/test';

test('a struck prop keeps its exact pose through WebGL rebuild and resets on retry', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8090');
  await page.waitForFunction(() => !!window.b0Harness);
  const struck = await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'elsewhere', quality: 'low' });
    await window.b0Harness.start(true);
    return window.b0Harness.bumpFirstProp(true);
  });
  expect(struck.motions).toHaveLength(1);
  expect(struck.motions[0][0]).toBe(struck.prop.id);
  expect(struck.motions[0][1].along).toBeGreaterThan(0);
  expect(struck.metrics.activeProps).toBe(1);
  expect(struck.speed).toBeGreaterThan(30);
  expect(await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    canvas.addEventListener('kit-restore', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error?.kind)).toBe('graphics');
  const inactive = await page.evaluate(() => window.b0Harness.dressingState());
  expect(inactive.motions).toEqual(struck.motions);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('kit-restore')));
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().error)).toBeNull();
  expect(await page.evaluate(() => window.b0Harness.snapshot().phase)).toBe('paused');
  const restored = await page.evaluate(() => window.b0Harness.dressingState());
  expect(restored.motions).toEqual(struck.motions);
  expect(restored.plan).toEqual(struck.plan);
  expect(restored.metrics.activeProps).toBe(1);
  expect(restored.metrics.dressing).toBe(struck.metrics.dressing);
  const repeated = await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
    return window.b0Harness.dressingState();
  });
  expect(repeated.motions).toEqual([]);
  expect(repeated.plan).toEqual(struck.plan);
  expect(pageErrors).toEqual([]);
  console.log('KIT CONTACT', JSON.stringify({ prop: struck.prop.kind, station: struck.prop.station,
    seconds: struck.time, speed: struck.speed, steps: struck.steps, cpuMs: struck.cpuMs, activeUs: struck.activeUs,
    visible: struck.metrics.dressing,
    counts: struck.plan.reduce<Record<string, number>>((counts, p) => ({ ...counts, [p.kind]: (counts[p.kind] ?? 0) + 1 }), {}) }));
});
