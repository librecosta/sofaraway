import { devices, expect, test } from '@playwright/test';
import { readMetrics } from '../diagnostics';
import { ready, record, resumeRun, startButton, startRun } from './support';

test('DPR 3 presents a reachable menu and either plays or protects the run', async ({ browser, browserName, baseURL }, info) => {
  const device = devices[browserName === 'webkit' ? 'iPhone 13' : 'Pixel 7'];
  const page = await browser.newPage({ ...device, deviceScaleFactor: 3, baseURL });
  try {
    if (!await ready(page, info, '/?q=low&dbg=1')) return;
    expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
    await expect(startButton(page)).toBeInViewport();
    await startRun(page, info, 'tap');
    await expect.poll(async () => {
      const { phase, beat } = await readMetrics(page);
      return phase === 'paused' || (phase === 'playing' && beat > 0.7);
    }).toBe(true);
    const pause = page.getByRole('dialog', { name: 'PAUSED' });
    if (await pause.isVisible()) {
      await expect(pause).toContainText('Rendering fell behind');
      const before = (await readMetrics(page)).beat;
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
      expect((await readMetrics(page)).beat).toBe(before);
      await pause.getByRole('button', { name: 'BACK TO MENU' }).tap();
      await expect(startButton(page)).toBeEnabled();
      record(info, 'BLOCKED', 'DPR 3 on this host hit the safe catch-up limit; menu, pause and exit worked');
    } else {
      record(info, 'PASS', 'DPR 3 gameplay advanced using the native browser compositor');
    }
  } finally {
    await page.close();
  }
});

test('mobile portrait and landscape keep settings, pause and results operable', async ({ page }, info) => {
  if (!await ready(page, info, '/?q=low&dbg=1&vol=drift')) return;
  const start = startButton(page);
  const portrait = page.viewportSize()!;
  const bounds = async () => {
    await page.locator('[data-act=settings]').tap();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    const close = settings.getByRole('button', { name: 'CLOSE' });
    const box = (await close.boundingBox())!;
    const viewport = await page.evaluate(() => [innerWidth, innerHeight]);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport[1] + 1);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport[0] + 1);
    await close.tap();
  };
  await bounds();
  await page.setViewportSize({ width: portrait.height, height: portrait.width });
  await expect.poll(async () => (await readMetrics(page)).canvas).toEqual([portrait.height, portrait.width]);
  await bounds();
  await startRun(page, info, 'tap');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  await expect.poll(async () => {
    const { phase, beat } = await readMetrics(page);
    return phase === 'paused' || (phase === 'playing' && beat > 0.1);
  }).toBe(true);
  await resumeRun(page, info, 'tap');
  await pause.tap();
  const dialog = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'RESUME', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await pause.tap();
  await dialog.getByRole('button', { name: 'BACK TO MENU' }).tap();
  await expect(start).toBeEnabled();
  await page.goto('/?vol=drift&q=low&t=141&god=0&align=1');
  await expect(page.locator('#over-title')).toHaveText('ESCAPED');
  await expect(page.locator('[data-act=restart]')).toBeInViewport();
  record(info, 'PASS', 'Native taps, portrait/landscape resize, touch pause/resume/exit and results');
});

test('touch movement uses only the primary contact and releases on cancellation', async ({ page, context, browserName }, info) => {
  if (!await ready(page, info, '/?vol=drift&q=low&dbg=1')) return;
  await startRun(page, info, 'tap');
  if (browserName === 'chromium') {
    const client = await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 100, y: 330 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 100, y: 330 }, { id: 2, x: 210, y: 220 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 100, y: 330 }, { id: 2, x: 280, y: 160 }] });
    expect((await readMetrics(page)).camera.tx).toBe(0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: 230, y: 250 }, { id: 2, x: 280, y: 160 }] });
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeGreaterThan(0.5);
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const after = await readMetrics(page);
    await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(after.beat + 0.2);
    expect((await readMetrics(page)).camera.tx).toBeCloseTo(after.camera.tx);
    expect((await readMetrics(page)).speed).toBeCloseTo(24);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
      canvas.addEventListener('pointerdown', event => {
        canvas.dataset.touchPointer = String(event.pointerId);
      }, { once: true });
      canvas.addEventListener('gotpointercapture', () => { canvas.dataset.gotCapture = 'true'; }, { once: true });
      canvas.addEventListener('lostpointercapture', () => { canvas.dataset.lostCapture = 'true'; }, { once: true });
    });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 3, x: 200, y: 300 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: 200, y: 290 }] });
    await expect(page.locator('#gl')).toHaveAttribute('data-got-capture', 'true');
    await page.locator('#gl').evaluate((canvas: HTMLCanvasElement) =>
      canvas.releasePointerCapture(Number(canvas.dataset.touchPointer)));
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 3, x: 60, y: 340 }] });
    await expect(page.locator('#gl')).toHaveAttribute('data-lost-capture', 'true');
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(after.beat + 0.35);
    expect((await readMetrics(page)).camera.tx).toBeCloseTo(after.camera.tx);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 4, x: 170, y: 300 }] });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const pause = page.getByRole('dialog', { name: 'PAUSED' });
    await expect(pause).toBeVisible();
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 4, x: 50, y: 340 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => {
      Reflect.deleteProperty(document, 'hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pause).toBeHidden();
    expect((await readMetrics(page)).camera.tx).toBeCloseTo(after.camera.tx);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 5, x: 230, y: 300 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 5, x: 80, y: 300 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeLessThan(after.camera.tx - 0.5);
    record(info, 'PASS', 'Native Chromium multi-touch, drag, cancel, capture loss, background cleanup and new touch');
  } else {
    // Playwright WebKit exposes native taps, with no native drag or multi-touch action.
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
      canvas.addEventListener('pointerup', event => {
        canvas.dataset.trustedTouch = String(event.isTrusted && event.pointerType === 'touch');
      }, { once: true });
    });
    await page.touchscreen.tap(110, 300);
    await expect(page.locator('#gl')).toHaveAttribute('data-trusted-touch', 'true');
    record(info, 'PASS', 'Native WebKit primary touch down/up');
    record(info, 'BLOCKED', 'WebKit native drag and multi-touch require a device or a driver with touch actions');
  }
});
