import { expect, test } from '@playwright/test';

test('one renderer survives volume changes and the run can pause, resume, and dispose', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const result = await page.evaluate(async () => {
    const test = window.b0Harness;
    await test.mount({ quality: 'low' });
    const original = document.querySelector('canvas')!;
    const gl = original.getContext('webgl2')!;
    const seen = [];
    for (const id of ['drift', 'descent', 'orbit', 'elsewhere'] as const) {
      await test.start(true);
      test.returnToMenu();
      await test.select(id);
      seen.push(test.snapshot().volumeId);
    }
    await test.start(true);
    test.pause();
    const paused = test.snapshot();
    await test.resume(true);
    const resumed = test.snapshot();
    const rendererReused = original === document.querySelector('canvas') && gl === original.getContext('webgl2');
    test.dispose();
    await test.start(true);
    return { seen, paused: paused.phase, resumed: resumed.phase, rendererReused, disposed: test.snapshot().phase };
  });
  expect(result).toEqual({
    seen: ['drift', 'descent', 'orbit', 'elsewhere'],
    paused: 'paused', resumed: 'playing', rendererReused: true, disposed: 'disposed',
  });
  await expect(page.locator('canvas')).toHaveCount(0);
});
