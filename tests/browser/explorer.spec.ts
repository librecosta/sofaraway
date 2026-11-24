import { expect, test } from '@playwright/test';

const explorerLabels = ['Overview', 'Worlds', 'Gates', 'Lighting', 'Materials', 'Gameplay', 'Endings', 'Audio', 'Interface'];
const topics = [
  ['worlds', 'World Explorer', null],
  ['gates', 'Gate Laboratory', '#gates'],
  ['lighting', 'Lighting Studio', null],
  ['materials', 'Material Laboratory', '#materials'],
  ['gameplay', 'Gameplay Systems', '#pickups'],
  ['endings', 'Ending Studio', '#outro'],
  ['interface', 'Interface Studio', '#ui-states'],
] as const;

test('the Explorer overview has nine destinations and loads only static previews', async ({ page }) => {
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let webgl = 0;
    let audio = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith('webgl')) webgl++;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
    for (const key of ['AudioContext', 'OfflineAudioContext'] as const) {
      window[key] = new Proxy(window[key], {
        construct(target, args, constructor) {
          audio++;
          return Reflect.construct(target, args, constructor);
        },
      }) as never;
    }
    window.addEventListener('read-explorer-resources', () => {
      document.documentElement.dataset.explorerResources = JSON.stringify({ webgl, audio });
    });
  });
  await page.goto('/debug/');
  await expect(page.getByRole('heading', { name: 'Technical Explorer' })).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  const navigation = page.getByRole('navigation', { name: 'Explorer', exact: true });
  expect(await navigation.getByRole('link').allTextContents()).toEqual(explorerLabels);
  await expect(navigation.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main canvas')).toHaveCount(0);
  const volumes = page.getByRole('region', { name: 'Four volumes' }).getByRole('link');
  await expect(volumes).toHaveCount(4);
  expect(await volumes.evaluateAll(links => links.map(link => (link as HTMLAnchorElement).search))).toEqual(
    ['?vol=elsewhere', '?vol=daybreak', '?vol=descent', '?vol=orbit']);
  await expect.poll(() => volumes.locator('img').evaluateAll(images =>
    images.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => {
    window.dispatchEvent(new Event('read-explorer-resources'));
    return JSON.parse(document.documentElement.dataset.explorerResources!);
  })).toEqual({ webgl: 0, audio: 0 });
  expect(scripts.filter(url => /\/assets\/(debug\.(?:audio|legacy)|previews\.client|scene\.client|GameRuntime|audio-export)/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test('each lab is directly served with its interactive workspace', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const [path, title, anchor] of topics) {
    const response = await page.goto(`/debug/${path}/`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(`SoFarAway / ${title}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
    await expect(page.getByRole('navigation', { name: 'Explorer', exact: true }).locator('[aria-current=page]')).toHaveAttribute('href', `/debug/${path}/`);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Explorer' })).toHaveAttribute('href', '/debug/');
    if (!anchor) {
      await expect(page.getByRole('button', { name: 'Open live scene' })).toBeVisible();
      await expect(page.locator('main canvas')).toHaveCount(0);
    } else await expect(page.locator(anchor)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('volume selection survives lab navigation, history and invalid input', async ({ page }) => {
  await page.goto('/debug/worlds/?vol=unknown&seed=7');
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('elsewhere');
  await expect(page.getByRole('heading', { name: 'How ELSEWHERE works' })).toBeVisible();
  await page.getByLabel('Volume', { exact: true }).selectOption('orbit');
  await expect(page).toHaveURL(/\/debug\/worlds\/\?vol=orbit&seed=7$/);
  await expect(page.getByRole('heading', { name: 'How ORBIT works' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Explorer', exact: true });
  await nav.getByRole('link', { name: 'Gates' }).click();
  await expect(page.locator('#gates-orbit canvas[data-mode=model]')).toHaveCount(3);
  await nav.getByRole('link', { name: 'Audio' }).click();
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('orbit');
  await expect(page.getByRole('link', { name: 'Back to game' })).toHaveAttribute('href', '/?vol=orbit');
  await page.goBack();
  await expect(page).toHaveURL(/\/debug\/gates\/\?vol=orbit$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/debug\/worlds\/\?vol=orbit&seed=7$/);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Gate Laboratory' })).toBeVisible();
});

test('old experiment and audio URLs preserve settings and replace the history entry', async ({ page }) => {
  await page.goto('/debug/worlds/?vol=orbit');
  await page.evaluate(() => location.assign('/debug/?vol=orbit&q=low&station=5000#gates-orbit'));
  await expect(page).toHaveURL(/\/debug\/gates\/\?vol=orbit&q=low&station=5000#gates-orbit$/);
  await expect(page.locator('#gates-orbit')).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/\/debug\/worlds\/\?vol=orbit$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/debug\/gates\/\?vol=orbit&q=low&station=5000#gates-orbit$/);

  await page.goto('/debug/?vol=descent&secs=2#audio');
  await expect(page).toHaveURL(/\/debug\/audio\/\?vol=descent&secs=2#audio$/);
  await expect(page.getByLabel('Volume', { exact: true })).toHaveValue('descent');
});

test('the Explorer navigation fits desktop, tablet and mobile and keeps keyboard focus visible', async ({ page }) => {
  await page.goto('/debug/');
  const navigation = page.getByRole('navigation', { name: 'Explorer', exact: true });
  for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540], [390, 844], [360, 760]]) {
    await page.setViewportSize({ width, height });
    await expect(navigation.getByRole('link', { name: 'Interface' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Back to game' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(navigation.getByRole('link', { name: 'Overview' })).toBeFocused();
  await expect(navigation.getByRole('link', { name: 'Overview' })).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'World Explorer' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});
