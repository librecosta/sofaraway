import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const start = (page: Page) => page.locator('[data-act=start]');
const volume = (page: Page) => page.locator('#vol-name');
async function diagnostics(page: Page) {
  const box = page.locator('#errbox');
  await expect(box).toHaveText(/^\{/);
  return box.evaluate(el => JSON.parse(el.textContent!));
}
const canvasId = async (page: Page) => page.locator('#gl').evaluate(el => {
  const canvas = el as HTMLCanvasElement;
  canvas.dataset.c1Marker ??= Math.random().toString(36);
  return canvas.dataset.c1Marker;
});

test('the volume wheel settles after rapid input, cycles, drags, and keeps one runtime canvas', async ({ page }) => {
  await page.goto('/?vol=elsewhere&q=low');
  await expect(start(page)).toBeEnabled();
  const marker = await canvasId(page);
  const wheel = page.getByRole('group', { name: 'Volume selector' });
  await page.mouse.move(8, 450);
  await page.mouse.wheel(0, 110);
  await expect(page).toHaveURL(/vol=elsewhere/);
  await wheel.hover();
  await page.mouse.wheel(0, 95);
  await expect(wheel).toHaveAttribute('data-moving', 'true');
  await expect(page).toHaveURL(/vol=elsewhere/);
  await expect(volume(page)).toContainText('DRIFT');
  await expect(wheel).toHaveAttribute('data-moving', 'false');
  await expect(start(page)).toBeEnabled();

  await wheel.hover();
  await page.mouse.wheel(0, 190);
  await expect(volume(page)).toContainText('ORBIT');
  await expect(start(page)).toBeEnabled();
  await wheel.press('ArrowDown');
  await expect(volume(page)).toContainText('ELSEWHERE');
  await expect(start(page)).toBeEnabled();
  await wheel.press('ArrowDown');
  await wheel.press('ArrowUp');
  await expect(wheel).toHaveAttribute('data-moving', 'false');
  await expect(volume(page)).toContainText('ELSEWHERE');
  await expect(start(page)).toBeEnabled();

  const box = (await wheel.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 89);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 33, { steps: 8 });
  await expect(wheel).toHaveAttribute('data-moving', 'true');
  await page.waitForTimeout(105);
  await page.mouse.up();
  await expect(volume(page)).toContainText('DRIFT');
  await expect(start(page)).toBeEnabled();
  expect(await canvasId(page)).toBe(marker);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await wheel.press('ArrowUp');
  await expect(wheel).toHaveAttribute('data-moving', 'false');
  await expect(volume(page)).toContainText('ELSEWHERE');
  await expect(start(page)).toBeEnabled();
  await wheel.press('ArrowDown');
  await page.goto('/debug/#ui-states');
  await expect(page.frameLocator('#ui-states iframe').getByRole('heading', { name: 'SOFARAWAY' })).toBeVisible();
});

test('touch drag changes tracks without scrolling the menu or starting a run', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8089/?q=low');
  await expect(start(page)).toBeEnabled();
  const wheel = (await page.locator('#vols').boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = wheel.x + wheel.width / 2;
  const y = wheel.y + 88;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let offset = 8; offset <= 56; offset += 8) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - offset }] });
  }
  await page.waitForTimeout(110);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(volume(page)).toContainText('DRIFT');
  await expect(start(page)).toBeEnabled();
  await expect(page.locator('#hud')).toBeHidden();
  await context.close();
});

test('selection animations reverse in place and acrylic dialogs trap and return focus', async ({ page }) => {
  await page.goto('/?q=low');
  await expect(start(page)).toBeEnabled();
  const mode = page.getByRole('button', { name: 'Next play mode' });
  const difficulty = page.getByRole('button', { name: 'Next difficulty' });
  await difficulty.focus();
  await page.keyboard.press('ArrowRight');
  const timing = await page.locator('#diff [data-selected=true]').evaluate(el => el.getAnimations()[0]?.effect?.getTiming().duration);
  expect(timing).toBe(420);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#diff [data-selected=true]')).toHaveText('NORMAL');
  await mode.click();
  await mode.click();
  await expect(page.getByRole('group', { name: 'Play mode' }).locator('[data-selected=true]')).toHaveText('STANDARD');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await difficulty.click();
  expect(await page.locator('#diff [data-selected=true]').evaluate(el => el.getAnimations().length)).toBe(0);

  const settings = page.getByRole('button', { name: 'SETTINGS' });
  await settings.focus();
  await settings.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('button', { name: 'HIGH' })).toBeFocused();
  await expect(page.locator('#menu').locator('..')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'CLOSE' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'HIGH' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await settings.click();
  await page.mouse.click(12, 12);
  await expect(dialog).toHaveCount(0);
});

test('clipboard feedback is top-centered, reports failure, and does not replace gameplay messages', async ({ page }) => {
  await page.addInitScript(() => {
    let fail = false;
    window.addEventListener('fail-share', () => { fail = true; });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => { if (fail) throw new DOMException('Denied', 'NotAllowedError'); } },
    });
  });
  await page.goto('/?q=low');
  const share = page.getByRole('button', { name: 'SHARE' });
  await share.click();
  const notice = page.getByRole('status').filter({ hasText: 'LINK COPIED' });
  await expect(notice).toBeVisible();
  const bounds = (await notice.boundingBox())!;
  expect(bounds.y).toBeLessThan(40);
  expect(Math.abs(bounds.x + bounds.width / 2 - 480)).toBeLessThan(2);
  await share.click();
  await expect(notice).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event('fail-share')));
  await share.click();
  await expect(page.getByRole('status').filter({ hasText: 'COULD NOT COPY LINK' })).toBeVisible();
  await expect(page.locator('#center-msg')).toBeEmpty();
});

test('dynamic lights use the same persisted setting across surfaces, including silent pause and resume', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { value: class extends NativeAudio {
      override get state(): AudioContextState { return 'suspended'; }
      override resume() { return Promise.reject(new DOMException('Blocked', 'NotAllowedError')); }
    } });
  });
  await page.goto('/?q=low&dbg=1&vol=descent');
  await expect(start(page)).toBeEnabled();
  const icon = page.getByRole('button', { name: 'Dynamic lights', exact: true });
  await expect(icon).toHaveAttribute('aria-pressed', 'false');
  const marker = await canvasId(page);
  await icon.click();
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'SETTINGS' }).click();
  const toggle = page.getByRole('switch', { name: 'DYNAMIC LIGHTS' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.keyboard.press('Escape');
  await expect(icon).toHaveAttribute('aria-pressed', 'false');
  expect(await canvasId(page)).toBe(marker);
  await icon.click();
  await page.reload();
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
  await start(page).click();
  await page.getByRole('button', { name: 'PLAY WITH SOUND OFF' }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(async () => (await diagnostics(page)).rhythmGain).toBeGreaterThan(1);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toBeVisible();
  await expect.poll(async () => (await diagnostics(page)).phase).toBe('paused');
  const paused = await diagnostics(page);
  await page.waitForTimeout(350);
  expect((await diagnostics(page)).beat).toBeCloseTo(paused.beat, 1);
  await page.getByRole('button', { name: 'RESUME' }).click();
  await expect.poll(async () => (await diagnostics(page)).beat).toBeGreaterThan(paused.beat);
});

test('fixed scenes respond in all four volumes while reduced motion leaves the baseline intact', async ({ page }) => {
  for (const volume of ['elsewhere', 'drift', 'descent', 'orbit']) {
    const t = ({ elsewhere: 97.58, drift: 109.15, descent: 103.72, orbit: 100.08 })[volume];
    const url = `/?t=${t}&vol=${volume}&q=low&dbg=1&ui=0&align=1`;
    await page.goto(url);
    await expect.poll(async () => (await diagnostics(page)).rhythmGain).toBe(1);
    const baseline = await diagnostics(page);
    await page.goto(url + '&lights=true');
    await expect.poll(async () => (await diagnostics(page)).rhythmGain).toBeGreaterThan(1);
    const enhanced = await diagnostics(page);
    for (const field of ['calls','programs','textures','geometries','distance','trackDistance','speed']) {
      expect(enhanced[field], volume + '/' + field).toEqual(baseline[field]);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect.poll(async () => (await diagnostics(page)).rhythmGain).toBe(1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
});

test('starting while the wheel is moving starts the intended course', async ({ page }) => {
  await page.goto('/?vol=elsewhere&q=low&dbg=1');
  await expect(start(page)).toBeEnabled();
  const wheel = page.getByRole('group', { name: 'Volume selector' });
  await wheel.press('ArrowDown');
  await expect(wheel).toHaveAttribute('data-moving', 'true');
  await wheel.press('Space');
  await expect(page).toHaveURL(/vol=drift/);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(volume(page)).toContainText('DRIFT');
  expect((await diagnostics(page)).phase).toBe('playing');
});
