import { expect, test } from '@playwright/test';
import { readMetrics } from './diagnostics';

test('desktop input, focus loss, termination and restart', async ({ page }) => {
  await page.goto('/?q=low&dbg=1');
  await page.locator('[data-diff=hard]').click();
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.move(480, 270);
  for (const [key, axis] of [['d', 'tx'], ['ArrowUp', 'ty']] as const) {
    const before = (await readMetrics(page)).camera[axis];
    await page.keyboard.down(key);
    await expect.poll(async () => (await readMetrics(page)).camera[axis]).toBeGreaterThan(before + 0.12);
    await page.keyboard.up(key);
  }
  await page.mouse.move(50, 50);
  await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeLessThan(-1);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.up();
  await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(24.7);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(async () => (await readMetrics(page)).speed).toBeLessThan(24.3);
  await page.keyboard.up('Shift');
  await page.mouse.move(480, 270);
  await expect(page.locator('#over-title')).toHaveText('TERMINATED', { timeout: 20_000 });
  await expect(page.locator('#over-acc')).toHaveText('0%');
  await page.locator('[data-act=restart]').click();
  await expect(page.locator('#hud-gates')).toHaveText('0/144');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 393, height: 720 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

  test('touch movement and cancellation do not engage desktop Boost', async ({ page, context }) => {
    await page.goto('/?q=low&dbg=1&vol=drift');
    await page.locator('[data-act=start]').tap();
    await expect(page.locator('#hud')).toBeVisible();
    const device = await context.newCDPSession(page);
    await device.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 130, y: 280 }] });
    await device.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 210 }] });
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeGreaterThan(0.25);
    await expect.poll(async () => (await readMetrics(page)).camera.ty).toBeGreaterThan(0.15);
    expect((await readMetrics(page)).speed).toBeCloseTo(24);
    await device.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const after = await readMetrics(page);
    await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(after.beat);
    expect((await readMetrics(page)).camera.tx).toBeCloseTo(after.camera.tx);
  });
});

test('blocked audio activation can be cancelled, retried, and replaced with the silent clock', async ({ page }) => {
  await page.addInitScript(() => {
    const Audio = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { value: class extends Audio {
      override get state(): AudioContextState { return 'suspended'; }
      override resume() { return new Promise<void>(() => {}); }
    } });
  });
  await page.goto('/?q=low&dbg=1');
  const start = page.locator('[data-act=start]');
  await start.click();
  await expect(start).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(start).toBeEnabled();
  await start.click();
  const fallback = page.getByRole('dialog', { name: 'AUDIO UNAVAILABLE' });
  await expect(fallback).toBeVisible();
  await fallback.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect(fallback).toBeVisible();
  await fallback.getByRole('button', { name: 'PLAY WITH SOUND OFF' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(0.2);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toHaveCount(0);
});

test('unsupported graphics retains the menu and can retry in the same document', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true, value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type === 'webgl2' ? null : Reflect.apply(original, this, [type, ...args]);
      },
    });
    window.addEventListener('b0:allow-webgl', () => {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: original });
    }, { once: true });
  });
  await page.goto('/');
  const fallback = page.getByRole('dialog', { name: 'GAME UNAVAILABLE' });
  await expect(fallback).toBeVisible();
  await expect(page.locator('[data-act=start]')).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('b0:allow-webgl')));
  await fallback.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await expect(page.locator('canvas#gl')).toHaveCount(1);
});

test('muting and unmuting an active run restores its configured gain', async ({ page }) => {
  await page.addInitScript(() => {
    const target = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (value, time, constant) {
      document.documentElement.dataset.testGain = String(value);
      return target.call(this, value, time, constant);
    };
  });
  await page.goto('/?q=low');
  await page.locator('[data-act=settings]').click();
  await page.locator('#set-volume').fill('37');
  await page.keyboard.press('Escape');
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveAttribute('data-test-gain', '0');
  await page.keyboard.press('m');
  await expect(page.locator('html')).toHaveAttribute('data-test-gain', '0.37');
});

test('the pause dialog preserves a run while waiting for graphics to restore', async ({ page }) => {
  await page.goto('/?q=low');
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('p');
  const fallback = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(fallback).toBeVisible();
  const supported = await page.evaluate(() => {
    const extension = document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    window.addEventListener('b0:restore-webgl', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  const resume = fallback.getByRole('button', { name: 'RESUME' });
  await expect(resume).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('b0:restore-webgl')));
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(fallback).toHaveCount(0);
});

test('disabled storage still allows configuration and play', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage disabled', 'SecurityError'); } });
  });
  await page.goto('/?q=low');
  await page.locator('[data-diff=hard]').click();
  await page.locator('[data-act=settings]').click();
  await page.locator('#set-volume').fill('37');
  await expect(page.locator('#set-volume')).toHaveValue('37');
  await page.keyboard.press('Escape');
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud-gates')).toHaveText('0/144');
});
