import { expect, test, type Page } from '@playwright/test';
import { clampSection, RANGE_X, RANGE_Y } from '../../app/game/core/collision';
import { readMetrics } from './diagnostics';

const start = '[data-act=start]';
const preference = 'sofaraway.immersiveMouse';
const owned = (page: Page) => page.evaluate(() => document.pointerLockElement?.id ?? null);
const pause = (page: Page) => page.getByRole('dialog', { name: 'PAUSED' });
const lockRequests = (page: Page) => page.locator('html').getAttribute('data-lock-requests');

async function mockPointerLock(page: Page, behavior: 'grant' | 'deny' | 'legacy-pending') {
  await page.addInitScript(behavior => {
    let owner: HTMLElement | null = null;
    let pending: HTMLElement | null = null;
    let requests = 0;
    let captures = 0;
    const change = () => document.dispatchEvent(new Event('pointerlockchange'));
    const error = () => document.dispatchEvent(new Event('pointerlockerror'));
    Object.defineProperty(document, 'pointerLockElement', { get: () => owner });
    document.exitPointerLock = () => {
      owner = null;
      queueMicrotask(change);
    };
    const capture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (id) {
      if (owner === this) document.documentElement.dataset.lockCaptures = String(++captures);
      else capture.call(this, id);
    };
    Object.defineProperty(HTMLElement.prototype, 'requestPointerLock', {
      value: function (this: HTMLElement) {
        document.documentElement.dataset.lockRequests = String(++requests);
        if (behavior === 'legacy-pending') { pending = this; return; }
        if (behavior === 'deny') {
          queueMicrotask(error);
          return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
        }
        owner = this;
        queueMicrotask(change);
        return Promise.resolve();
      },
    });
    window.addEventListener('test:grant-lock', () => { owner = pending; pending = null; change(); });
    window.addEventListener('test:deny-lock', () => { pending = null; error(); });
    window.addEventListener('test:lose-lock', () => { owner = null; change(); });
  }, behavior);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  return page.getByRole('dialog', { name: 'Settings' });
}

async function enablePreference(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'IMMERSIVE MOUSE' }).check();
  await settings.getByRole('button', { name: 'CLOSE' }).click();
}

async function movement(page: Page, x: number, y: number) {
  await page.locator('canvas#gl').evaluate((canvas, [movementX, movementY]) => {
    const event = { movementX, movementY, clientX: 1, clientY: 1, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, pointerType: 'mouse' }));
    canvas.dispatchEvent(new MouseEvent('mousemove', event));
  }, [x, y]);
}

function cursor(page: Page) {
  return page.locator('#cursor').evaluate(node => {
    const { m41, m42 } = new DOMMatrix(getComputedStyle(node).transform);
    return [m41, m42];
  });
}

test('the default is off, and a denied lock preserves the preference and absolute mouse steering', async ({ page }) => {
  await mockPointerLock(page, 'deny');
  await page.goto('/?q=low&dbg=1');
  const settings = await openSettings(page);
  const toggle = settings.getByRole('switch', { name: 'IMMERSIVE MOUSE' });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/Press Esc/);
  expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBeNull();
  expect(await lockRequests(page)).toBeNull();
  await settings.getByRole('button', { name: 'CLOSE' }).click();
  await page.locator(start).click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await lockRequests(page)).toBeNull();
  await page.keyboard.press('Escape');
  await enablePreference(page);
  await page.reload();
  await expect(await openSettings(page)).toBeVisible();
  await expect(toggle).toBeChecked();
  await settings.getByRole('button', { name: 'CLOSE' }).click();
  await page.keyboard.press('x');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await lockRequests(page)).toBe('1');
  expect(await owned(page)).toBeNull();
  await page.mouse.move(70, 180);
  await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeLessThan(-1);
  expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBe('true');
});

test('a missing Pointer Lock API hides the mouse setting and keeps the game playable', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'true');
    Object.defineProperty(HTMLElement.prototype, 'requestPointerLock', { value: undefined });
  }, preference);
  await page.goto('/?q=low&dbg=1');
  const settings = await openSettings(page);
  await expect(settings.getByRole('switch', { name: 'IMMERSIVE MOUSE' })).toHaveCount(0);
  await settings.getByRole('button', { name: 'CLOSE' }).click();
  await page.locator(start).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.move(70, 180);
  await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeLessThan(-1);
});

test('relative mouse uses the shared steering map once, clamps and resizes its cursor, and keeps both Boost inputs', async ({ page }) => {
  await mockPointerLock(page, 'grant');
  await page.goto('/?q=low&dbg=1&god=1');
  await enablePreference(page);
  await page.locator(start).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => cursor(page)).toEqual([480, 270]);
  await movement(page, 80, 20);
  await expect.poll(() => cursor(page)).toEqual([560, 290]);
  const [x, y] = clampSection((560 / 960 * 2 - 1) * RANGE_X, (1 - 290 / 540 * 2) * RANGE_Y, 0.34);
  await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeCloseTo(x, 5);
  await expect.poll(async () => (await readMetrics(page)).camera.ty).toBeCloseTo(y, 5);
  await page.setViewportSize({ width: 1440, height: 810 });
  await expect.poll(() => cursor(page)).toEqual([840, 435]);
  await movement(page, 8000, -8000);
  await expect.poll(() => cursor(page)).toEqual([1440, 0]);
  await page.keyboard.down('a');
  await expect.poll(async () => (await cursor(page))[0]).toBeLessThan(1300);
  await page.keyboard.up('a');
  const canvas = page.locator('#gl');
  await canvas.dispatchEvent('pointerdown', { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0 });
  await canvas.dispatchEvent('mousedown', { button: 0 });
  await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(24.7);
  await expect(page.locator('html')).not.toHaveAttribute('data-lock-captures', /.+/);
  await page.keyboard.down('Shift');
  await canvas.dispatchEvent('mouseup', { button: 0 });
  await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(24.7);
  await page.keyboard.press('p');
  await expect(pause(page)).toContainText('Your run is paused.');
  expect(await owned(page)).toBeNull();
  const tx = (await readMetrics(page)).camera.tx;
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(pause(page)).toBeHidden();
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await readMetrics(page)).speed).toBeLessThan(24.3);
  expect((await readMetrics(page)).camera.tx).toBeCloseTo(tx, 1);
  await page.evaluate(() => window.dispatchEvent(new Event('test:lose-lock')));
  await expect(pause(page)).toContainText('Mouse released.');
  await page.keyboard.press('Escape');
  await expect(pause(page)).toBeVisible();
  expect(await lockRequests(page)).toBe('2');
  await pause(page).getByRole('button', { name: 'BACK TO MENU' }).click();
  await expect(page.locator(start)).toBeEnabled();
});

test('legacy late success is released after a rapid pause/resume and runtime disposal', async ({ page }) => {
  await mockPointerLock(page, 'legacy-pending');
  await page.goto('/?q=low&god=1');
  await enablePreference(page);
  await page.locator(start).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('p');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect(pause(page)).toBeHidden();
  expect(await lockRequests(page)).toBe('1');
  await page.evaluate(() => window.dispatchEvent(new Event('test:grant-lock')));
  expect(await owned(page)).toBeNull();
  await expect(pause(page)).toBeHidden();
  await page.keyboard.press('p');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => lockRequests(page)).toBe('2');
  await page.evaluate(() => window.dispatchEvent(new Event('test:deny-lock')));
  await expect(pause(page)).toBeHidden();
  await page.keyboard.press('p');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => lockRequests(page)).toBe('3');
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new Event('test:grant-lock'));
  });
  expect(await owned(page)).toBeNull();
});

test('context recovery and background recovery resume without lock, and results offer an explicit retry', async ({ page }) => {
  await mockPointerLock(page, 'grant');
  await page.goto('/?q=low&dbg=1');
  await enablePreference(page);
  await page.getByRole('button', { name: 'Next difficulty' }).click();
  await page.locator(start).click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await owned(page)).toBe('gl');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(pause(page)).toContainText('Mouse released.');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(pause(page)).toContainText('foreground');
  expect(await owned(page)).toBeNull();
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(pause(page)).toBeHidden();
  expect(await owned(page)).toBeNull();
  await page.keyboard.press('p');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(pause(page)).toBeHidden();
  await page.evaluate(() => {
    const ext = document.querySelector<HTMLCanvasElement>('#gl')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    window.addEventListener('test:restore-gl', () => ext.restoreContext(), { once: true });
    ext.loseContext();
  });
  await expect(page.getByText(/Waiting for WebGL/)).toBeVisible();
  expect(await owned(page)).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event('test:restore-gl')));
  await expect.poll(async () => (await readMetrics(page)).phase).toBe('playing');
  expect(await owned(page)).toBeNull();
  expect(await lockRequests(page)).toBe('3');
  await page.keyboard.press('p');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(pause(page)).toBeHidden();
  await movement(page, -5000, -5000);
  const outcome = page.locator('#over-title');
  await expect(outcome).toBeVisible({ timeout: 20_000 });
  await expect(outcome).toHaveText('TERMINATED');
  expect(await owned(page)).toBeNull();
  await page.locator('[data-act=restart]').click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await lockRequests(page)).toBe('5');
});

test('Showcase, fixed captures and automatic starts do not request Pointer Lock', async ({ page }) => {
  await mockPointerLock(page, 'grant');
  await page.addInitScript(key => localStorage.setItem(key, 'true'), preference);
  await page.goto('/?q=low&mode=showcase');
  await page.locator(start).click();
  await expect(page.locator('#menu')).toBeHidden();
  expect(await lockRequests(page)).toBeNull();
  await page.goto('/?q=low&t=1&dbg=1');
  await expect.poll(async () => (await readMetrics(page)).phase).toBe('playing');
  expect(await lockRequests(page)).toBeNull();
  await page.goto('/?q=low&auto=1');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await lockRequests(page)).toBeNull();
});

test('headed Chromium acquires native Pointer Lock from trusted Start and Resume gestures', async ({ page }) => {
  test.skip(process.env.F5_HEADED_POINTER_LOCK !== '1', 'Run explicitly in a headed Chromium session.');
  await page.goto('/?q=low&god=1&dbg=1');
  await enablePreference(page);
  await page.locator(start).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.down();
  await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(24.7);
  await page.mouse.up();
  await expect.poll(async () => (await readMetrics(page)).speed).toBeLessThan(24.3);
  await page.evaluate(() => document.exitPointerLock());
  await expect(pause(page)).toContainText('Mouse released.');
  await pause(page).getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(() => owned(page)).toBe('gl');
  await page.keyboard.press('p');
  await expect(pause(page)).toBeVisible();
  await expect.poll(() => owned(page)).toBeNull();
});
