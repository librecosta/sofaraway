import { expect, test } from '@playwright/test';
import type {} from '../harness/main';

test('APHELION keeps the same sphere and prewarmed programs from approach through visibility', async ({ page }, details) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8090/');
  for (const quality of ['low', 'auto', 'high'] as const) {
    const result = await page.evaluate(quality => window.b0Harness.inspectAphelion(quality, 'course',
      quality !== 'low', 1, 358, 1, true), quality);
    expect(result.glError).toBe(0);
    expect(result.releasedMaterials).toBe(4);
    expect(result.releasedRing).toBe(1);
    expect(result.features).toEqual([
      { name: 'Aphelion gas giant', order: -3, depthTest: true, depthWrite: true, singlePass: true },
      { name: 'Aphelion atmosphere', order: -2, depthTest: true, depthWrite: false, singlePass: true },
      { name: 'Aphelion companion', order: -3, depthTest: true, depthWrite: true, singlePass: true },
      { name: 'Aphelion rings', order: -1, depthTest: true, depthWrite: false, singlePass: true },
    ]);
    const firstVisible = result.frames.findIndex(frame => frame.visible);
    expect(firstVisible).toBeGreaterThan(0);
    expect(result.frames[firstVisible - 1].presence).toBeLessThanOrEqual(.001);
    expect(result.frames.every(frame => frame.prewarmed)).toBe(true);
    expect(new Set(result.frames.map(frame => frame.identity)).size).toBe(1);
    expect(result.frames.at(-1)!.visible).toBe(true);
    await details.attach(quality, { body: Buffer.from(result.shot.split(',')[1], 'base64'), contentType: 'image/png' });
  }
  expect(errors).toEqual([]);
});

test('APHELION debug frames both bodies and restores the selected view', async ({ page }) => {
  await page.goto('/debug/?q=low#orbit');
  const preview = page.locator('#orbit');
  await preview.getByRole('button', { name: 'Open flight preview' }).click();
  await expect(preview.locator('[data-orbit-metrics]')).toBeVisible();
  const select = preview.getByLabel('Aphelion view');
  const canvas = preview.locator('canvas');
  await select.selectOption('planet');
  const globe = await canvas.screenshot();
  await select.selectOption('moon');
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), globe)).not.toBe(0);
  await canvas.evaluate((el: HTMLCanvasElement) => {
    const ext = el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    el.addEventListener('webglcontextrestored', () => { el.dataset.restored = 'true'; }, { once: true });
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 300);
  });
  await expect(canvas).toHaveAttribute('data-restored', 'true');
  await expect(select).toHaveValue('moon');
  await select.selectOption('course');
  await expect(select).toHaveValue('course');
  await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError())).toBe(0);
});

test('APHELION cloud inspection is deterministic for the same sphere view', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const results = await page.evaluate(async () => {
    const first = await window.b0Harness.inspectAphelion('high', 'poles', false, 0, 358, 2);
    const second = await window.b0Harness.inspectAphelion('high', 'poles', false, 0, 358, 2);
    return { glErrors: [first.glError, second.glError], identical: first.shot === second.shot };
  });
  expect(results).toEqual({ glErrors: [0, 0], identical: true });
});
