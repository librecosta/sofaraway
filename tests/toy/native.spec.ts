import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { extname } from 'node:path';

const entry = 'https://www.bilibili.com/toy/sofaraway/index.html';
const sdk = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
const start = '[data-act=start]';
const mode = '[data-act=fullscreen]';

test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Mobile BiliApp/9.9.0',
  viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });

async function serveToy(page: Page, source: string | null) {
  const media: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  };
  await page.route('https://www.bilibili.com/toy/sofaraway/**', route => {
    const file = new URL(route.request().url()).pathname.split('/sofaraway/')[1];
    return route.fulfill({ path: 'build/toy/' + file, contentType: media[extname(file)] });
  });
  await page.route(sdk, route => source === null ? route.abort() :
    route.fulfill({ body: source, contentType: 'text/javascript' }));
}

test('the release loads the official SDK URL and confirms native mode with actual state', async ({ page }) => {
  await serveToy(page, `
    const portrait = { deviceType: 'phone', viewport: { width: 390, height: 760 },
      orientation: 'portrait', immersive: false, safeArea: { top: 38, left: 4, bottom: 48, right: 0 } };
    const landscape = { ...portrait, orientation: 'landscape', immersive: true,
      viewport: { width: 760, height: 390 }, safeArea: { top: 20, left: 40, bottom: 23, right: 40 } };
    let container, close, current = portrait, reads = 0;
    window.toyFixture = {
      modes: [], removed: [], readDone: false,
      portrait: () => container?.(current = portrait), landscape: () => container?.(current = landscape),
      resize: () => container?.(current = { ...landscape, viewport: { width: 730, height: 380 } }),
      close: () => close?.(),
    };
    window.toy = {
      isSupport: async () => true,
      getContainerState: () => {
        if (reads++) return Promise.resolve(current);
        return new Promise(resolve => setTimeout(() => {
          window.toyFixture.readDone = true;
          resolve({ ...portrait, safeArea: { ...portrait.safeArea, top: 3 } });
        }, 900));
      },
      onContainerChange: listener => {
        container = listener;
        listener(portrait);
        return () => { window.toyFixture.removed.push('container'); container = undefined; };
      },
      setContainerMode: async request => { window.toyFixture.modes.push(request); },
      onPageClose: listener => {
        close = listener;
        return () => { window.toyFixture.removed.push('close'); close = undefined; };
      },
    };
  `);
  await page.addInitScript(() => {
    localStorage.setItem('sofaraway.bilibili.sofaraway.quality', 'low');
    localStorage.setItem('sofaraway.bilibili.sofaraway.autoBoost', 'true');
    let contexts = 0;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        document.documentElement.dataset.audioContexts = String(++contexts);
      }
      close() {
        document.documentElement.dataset.audioClosed = 'true';
        return super.close();
      }
    };
  });
  await page.goto(entry);
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator(mode)).toHaveAccessibleName('横屏游玩');
  const canvas = await page.locator('#gl').elementHandle();
  const html = page.locator('html');
  await expect(html).toHaveCSS('--safe-area-top', '38px');
  const topControls = await page.locator('[data-menu-top]').boundingBox();
  expect(topControls?.y).toBeGreaterThanOrEqual(38);
  const sound = page.locator('[data-menu-top] button[aria-pressed]');
  expect((await sound.boundingBox())!.x).toBeLessThan(195);
  await page.evaluate(() => Reflect.get(window, 'toyFixture').portrait());
  await page.waitForFunction(() => Reflect.get(window, 'toyFixture').readDone);
  await expect(html).toHaveCSS('--safe-area-top', '38px');
  await page.locator(mode).tap();
  await expect(page.locator('#menu [role=status]')).toContainText('正在切换显示模式');
  await expect(page.locator(start)).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'toyFixture').modes)).toEqual([
    { orientation: 'landscape', immersive: true },
  ]);
  expect(await html.getAttribute('data-audio-contexts')).toBeNull();
  await page.setViewportSize({ width: 760, height: 390 });
  await page.evaluate(() => Reflect.get(window, 'toyFixture').landscape());
  await expect(page.locator(mode)).toHaveAccessibleName('退出沉浸模式');
  await expect(html).toHaveCSS('--safe-area-left', '40px');
  await expect(page.locator(start)).toBeEnabled();
  await page.locator(start).tap();
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await expect(html).toHaveAttribute('data-audio-contexts', '1');
  await expect(page.locator('#hint')).toContainText('拖动以转向');
  const health = await page.locator('#hud-lives').getAttribute('aria-label');

  // A plain viewport update leaves the song and flight running.
  await page.evaluate(() => Reflect.get(window, 'toyFixture').resize());
  await expect(page.locator('#gl')).toHaveCSS('width', '730px');
  await expect(page.locator('#gl')).toHaveCSS('height', '380px');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  const switched = page.getByText('屏幕方向已改变，准备好后可继续。');
  await page.setViewportSize({ width: 390, height: 760 });
  await page.evaluate(() => Reflect.get(window, 'toyFixture').portrait());
  await expect(switched).toBeVisible();
  await expect(page.locator('#hud-lives')).toHaveAttribute('aria-label', health!);
  await page.getByRole('button', { name: '继续', exact: true }).tap();
  await expect(page.locator('#hud-boost')).toHaveCSS('opacity', '1');
  await expect(html).toHaveAttribute('data-audio-contexts', '1');
  expect(await canvas!.evaluate(element => element === document.querySelector('#gl'))).toBe(true);

  await page.evaluate(() => Reflect.get(window, 'toyFixture').close());
  await expect(page.locator('#gl')).toHaveCount(0);
  await expect(html).toHaveAttribute('data-audio-closed', 'true');
  expect((await page.evaluate(() => Reflect.get(window, 'toyFixture').removed)).sort()).toEqual(['close', 'container']);
});

for (const source of [null, 'window.toy = { isSupport: async () => false };',
  'window.toy = { isSupport: () => new Promise(() => {}) };']) {
  test(`the player starts independently of the SDK (${source === null ? 'load error' : source.includes('false') ? 'unsupported' : 'probe timeout'})`, async ({ page }) => {
    await serveToy(page, source);
    await page.addInitScript(() => {
      localStorage.setItem('sofaraway.bilibili.sofaraway.quality', 'low');
      Object.defineProperty(document, 'fullscreenEnabled', { value: false });
    });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(entry, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(start)).toBeEnabled();
    await expect(page.locator(mode)).toHaveCount(0);
    await page.locator(start).tap();
    await expect(page.locator('#hud')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
