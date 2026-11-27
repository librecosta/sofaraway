import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readMetrics, type Metrics } from './diagnostics';

const preference = 'sofaraway.orientation';
const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
const paused = (page: Page) => page.getByRole('dialog', { name: 'PAUSED' });
const start = (page: Page) => page.locator('[data-act=start]');
const fullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement?.tagName ?? null);

async function settings(page: Page) {
  await page.locator('[data-act=settings]').tap();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.F6_MOBILE_SCREENSHOTS === '1') {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, animations: 'disabled', style: '#errbox { visibility: hidden }' });
    await info.attach(name, { path, contentType: 'image/png' });
  }
}

async function mockOrientation(page: Page, outcome: 'grant' | 'deny' | 'late' | 'unsupported') {
  await page.addInitScript(outcome => {
    let owner: Element | null = null;
    let unlocks = 0;
    const requests: string[] = [];
    const change = () => document.dispatchEvent(new Event('fullscreenchange'));
    Object.defineProperties(document, {
      fullscreenEnabled: { get: () => true }, fullscreenElement: { get: () => owner },
      exitFullscreen: { value: async () => { owner = null; change(); } },
    });
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { value: async function (this: HTMLElement) {
      owner = this;
      change();
    } });
    if (outcome === 'unsupported') {
      Object.defineProperty(screen, 'orientation', { value: undefined });
      return;
    }
    Object.defineProperties(screen.orientation, {
      lock: { value: (value: string) => {
        requests.push(value);
        document.documentElement.dataset.lockRequests = requests.join(',');
        if (outcome === 'deny') return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
        if (outcome === 'late') return new Promise<void>(resolve => {
          window.addEventListener('test:orientation-ready', () => resolve(), { once: true });
        });
        return Promise.resolve();
      } },
      unlock: { value: () => { document.documentElement.dataset.unlocks = String(++unlocks); } },
    });
  }, outcome);
}

type Flight = Metrics & { audio: { resumes: number; silentFallbacks: number }; branch: unknown };
const flight = async (page: Page) => await readMetrics(page) as Flight;

test.describe('compact touch', () => {
  test.use({ viewport: portrait, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test('a portrait visit can start immediately and Settings remembers the fullscreen preference', async ({ page }, info) => {
    await mockOrientation(page, 'unsupported');
    await page.goto('/?q=low');
    await expect(start(page)).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await fullscreen(page)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBeNull();
    await capture(page, info, '390x844-first-visit');
    await start(page).tap();
    await expect(page.locator('#hud')).toBeVisible();
    expect(await fullscreen(page)).toBeNull();
    expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBeNull();

    await page.reload();
    await expect(start(page)).toBeEnabled();
    const panel = await settings(page);
    await expect(panel.getByRole('button', { name: 'LANDSCAPE' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'PORTRAIT' }).tap();
    await page.reload();
    await expect(start(page)).toBeEnabled();
    expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBe('portrait');
    await page.setViewportSize(landscape);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const rotated = await settings(page);
    await expect(rotated.getByRole('button', { name: 'PORTRAIT' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).not.toHaveAttribute('data-lock-requests', /.+/);
  });

  test('native lock follows a fullscreen gesture and applies new preferences in fullscreen', async ({ page }) => {
    await mockOrientation(page, 'grant');
    await page.goto('/?q=low');
    await expect(start(page)).toBeEnabled();
    expect(await fullscreen(page)).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-lock-requests', /.+/);
    await page.locator('[data-act=fullscreen]').tap();
    await expect.poll(() => fullscreen(page)).toBe('MAIN');
    await expect(page.locator('html')).toHaveAttribute('data-lock-requests', 'landscape');
    await page.setViewportSize(landscape);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const panel = await settings(page);
    await panel.getByRole('button', { name: 'PORTRAIT' }).tap();
    await expect(page.locator('html')).toHaveAttribute('data-lock-requests', 'landscape,portrait');
    await panel.getByRole('button', { name: 'EXIT FULLSCREEN' }).tap();
    await expect.poll(() => fullscreen(page)).toBeNull();
    await expect(page.locator('html')).toHaveAttribute('data-unlocks', '1');
    await panel.getByRole('button', { name: 'CLOSE' }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(start(page)).toBeEnabled();
  });

  test('denied locks leave the menu usable and late locks are released after fullscreen exits', async ({ page, context }) => {
    await mockOrientation(page, 'deny');
    await page.goto('/?q=low');
    await page.locator('[data-act=fullscreen]').tap();
    await expect(page.locator('html')).toHaveAttribute('data-lock-requests', 'landscape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(start(page)).toBeEnabled();

    const late = await context.newPage();
    await mockOrientation(late, 'late');
    await late.goto('/?q=low');
    await expect(start(late)).toBeEnabled();
    const panel = await settings(late);
    await panel.getByRole('button', { name: 'PORTRAIT' }).tap();
    await panel.getByRole('button', { name: 'ENTER FULLSCREEN' }).tap();
    await expect(late.locator('html')).toHaveAttribute('data-lock-requests', 'portrait');
    await panel.getByRole('button', { name: 'EXIT FULLSCREEN' }).tap();
    await expect(late.locator('html')).toHaveAttribute('data-unlocks', '1');
    await late.evaluate(() => window.dispatchEvent(new Event('test:orientation-ready')));
    await expect(late.locator('html')).toHaveAttribute('data-unlocks', '2');
    expect(await fullscreen(late)).toBeNull();
    await late.close();
  });

  test('rotation pauses an audio-led run, clears touches and resizes without resetting the run', async ({ page, context }, info) => {
    await page.setViewportSize(landscape);
    await page.goto('/?vol=daybreak&q=low&dbg=1&god=1');
    await page.locator('#gl').evaluate(canvas => canvas.setAttribute('data-canvas-test', 'original'));
    await start(page).tap();
    await expect.poll(async () => (await flight(page)).beat).toBeGreaterThan(.8);
    expect((await flight(page)).audio.silentFallbacks).toBe(0);
    await page.setViewportSize({ ...landscape, height: 365 });
    await expect.poll(async () => (await flight(page)).canvas).toEqual([844, 365]);
    await expect(paused(page)).toHaveCount(0);
    await page.setViewportSize(landscape);
    await expect.poll(async () => (await flight(page)).canvas).toEqual([844, 390]);
    await capture(page, info, '844x390-flight');

    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 200 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 310, y: 190 }] });
    await expect.poll(async () => (await flight(page)).camera.tx).toBeGreaterThan(.25);
    await page.setViewportSize(portrait);
    await expect(paused(page)).toContainText('Screen orientation changed.');
    await expect.poll(async () => (await flight(page)).phase).toBe('paused');
    const frozen = await flight(page);
    const score = await page.locator('#hud-score').textContent();
    const lives = () => page.locator('#hud-lives i').evaluateAll(nodes => nodes.filter(node => node.classList.length).length);
    const remainingLives = await lives();
    await expect.poll(async () => (await flight(page)).canvas).toEqual([390, 844]);
    await expect.poll(async () => (await flight(page)).targets[0]?.slice(0, 2)).toEqual([390, 844]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 45, y: 300 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await flight(page)).toMatchObject({ phase: 'paused', beat: frozen.beat, distance: frozen.distance,
      branch: frozen.branch, camera: frozen.camera, audio: { resumes: 0 } });
    await expect(page.locator('#hud-score')).toHaveText(score!);
    expect(await lives()).toBe(remainingLives);
    await capture(page, info, '390x844-rotation-pause');

    // A second rotation while paused keeps the same run frozen.
    await page.setViewportSize(landscape);
    await expect(paused(page)).toContainText('Screen orientation changed.');
    expect((await flight(page)).distance).toBe(frozen.distance);
    await page.setViewportSize(portrait);
    expect(await page.evaluate(key => localStorage.getItem(key), preference)).toBeNull();
    await paused(page).getByRole('button', { name: 'RESUME' }).tap();
    await expect.poll(async () => (await flight(page)).beat).toBeGreaterThan(frozen.beat);
    await expect.poll(async () => (await flight(page)).audio.resumes).toBe(1);
    expect((await flight(page)).camera.tx).toBeCloseTo(frozen.camera.tx);
    await expect(page.locator('#gl')).toHaveAttribute('data-canvas-test', 'original');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 230, y: 465 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 95, y: 395 }] });
    await expect.poll(async () => (await flight(page)).camera.tx).toBeLessThan(frozen.camera.tx - .5);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await capture(page, info, '390x844-flight');
  });

  test('menu, settings and results fit the compact landscape and portrait sizes', async ({ page }, info) => {
    await page.goto('/?q=low');
    for (const [width, height] of [[640, 360], [740, 360], [844, 390], [932, 430], [360, 640], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await expect(start(page)).toBeEnabled();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      for (const control of [start(page), page.locator('#vols'), page.getByRole('group', { name: 'Difficulty' }), page.locator('[data-act=settings]')]) {
        await expect(control, `${width}×${height}`).toBeInViewport({ ratio: .99 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      if (width === 640 || width === 390) await capture(page, info, `${width}x${height}-menu`);
      const panel = await settings(page);
      await expect(panel.getByRole('group', { name: 'Orientation' })).toBeInViewport({ ratio: .99 });
      await expect(panel.getByRole('button', { name: 'CLOSE' })).toBeInViewport({ ratio: .99 });
      if (width === 640 || width === 390) await capture(page, info, `${width}x${height}-settings`);
      await panel.getByRole('button', { name: 'CLOSE' }).tap();
    }
    for (const size of [{ width: 640, height: 360 }, portrait]) {
      await page.setViewportSize(size);
      await page.goto('/?vol=daybreak&diff=hard&q=low&t=146.5&god=0&align=1');
      await expect(page.locator('#over')).toBeVisible();
      await expect(page.locator('#over-title')).toHaveText('ESCAPED');
      await expect(page.locator('[data-act=restart]')).toBeInViewport({ ratio: .99 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(size.width);
      await capture(page, info, `${size.width}x${size.height}-results`);
    }
  });
});

test('a narrow desktop and a narrow tablet window retain the regular responsive menu', async ({ page, browser, baseURL }) => {
  await page.setViewportSize(portrait);
  await page.goto('/?q=low');
  await expect(start(page)).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-act=settings]').click();
  await expect(page.getByRole('group', { name: 'Orientation' })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'IMMERSIVE MOUSE' })).toBeVisible();
  const tablet = await browser.newPage({ baseURL, viewport: portrait, screen: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
  try {
    await tablet.goto('/?q=low');
    await expect(start(tablet)).toBeEnabled();
    await expect(tablet.getByRole('dialog')).toHaveCount(0);
    await expect((await settings(tablet)).getByRole('group', { name: 'Orientation' })).toHaveCount(0);
  } finally { await tablet.close(); }
});
