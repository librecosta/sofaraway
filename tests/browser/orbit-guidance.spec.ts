import { expect, test } from '@playwright/test';
import type {} from '../harness/main';

test('touch chooses the visible astral route, whose entry beacons survive pause and WebGL recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8090/');
  await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'orbit', quality: 'low', runSeed: 0, diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false, mobileQuality: false,
      post: true, record: false, debug: true } });
    await window.b0Harness.start(true);
    window.b0Harness.advanceAndPause(110, true);
    await window.b0Harness.resume(true);
    window.b0Harness.dynamicLights(true);
  });
  const state = () => page.evaluate(() => window.b0Harness.branchState());
  await expect.poll(async () => (await state()).metrics.entryBeacons?.visible).toBe(true);
  // The bare harness canvas needs the production viewport's touch-action contract.
  const canvas = page.locator('canvas');
  await canvas.evaluate((el: HTMLCanvasElement) => {
    el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;touch-action:none';
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 480, y: 350 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 90, y: 350 }] });
  await expect.poll(async () => (await state()).routeSide).toBe('left');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => window.b0Harness.dynamicLights(false));
  expect((await state()).metrics.routeHologram).toBeUndefined();
  expect((await state()).metrics.entryBeacons?.visible).toBe(true);
  await page.evaluate(() => window.b0Harness.pause());
  const held = (await state()).trackDistance;
  const gain = (await state()).metrics.entryBeacons?.gain;
  await page.waitForTimeout(150);
  expect((await state()).trackDistance).toBe(held);
  expect((await state()).metrics.entryBeacons?.gain).toBe(gain);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await canvas.evaluate((el: HTMLCanvasElement) => {
    el.addEventListener('webglcontextrestored', () => { el.dataset.restored = 'true'; }, { once: true });
    const ext = el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext(); setTimeout(() => ext.restoreContext(), 300);
  });
  await expect(canvas).toHaveAttribute('data-restored', 'true');
  await page.evaluate(() => window.b0Harness.resume(true));
  expect((await state()).metrics.entryBeacons?.visible).toBe(true);
  await expect.poll(async () => (await state()).route).toBe('score');
  expect((await state()).metrics.entryBeacons).toMatchObject({ selected: 0 });
  expect((await state()).metrics.entryBeacons!.colors).toEqual(['#f2c575', '#66ddec', '#c78bf3']);
  await page.mouse.move(480, 270);
  await page.evaluate(() => window.b0Harness.advanceAndPause(146));
  expect((await state()).pickup?.status).toBe('pending');
  expect((await state()).metrics.entryBeacons?.visible).toBe(false);
  await page.evaluate(async () => {
    window.b0Harness.returnToMenu();
    await window.b0Harness.select('elsewhere');
    await window.b0Harness.start(true);
  });
  expect((await state()).metrics.entryBeacons).toBeUndefined();
  expect(errors).toEqual([]);
});
