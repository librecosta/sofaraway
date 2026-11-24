import { expect, test, type Locator, type Page } from '@playwright/test';

const volumes = ['elsewhere', 'daybreak', 'descent', 'orbit'] as const;
const laterChapters = { elsewhere: 'DROP', daybreak: 'SUNBURST', descent: 'LOCKDOWN · LOCKDOWN', orbit: 'AURORA' };

async function openScene(page: Page) {
  await page.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = page.locator('main canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  return canvas;
}

async function chooseChapter(page: Page, volume: typeof volumes[number], studio = false) {
  const chapter = laterChapters[volume];
  if (volume === 'orbit') await page.getByRole('button', { name: chapter, exact: true }).click();
  else await page.getByRole('combobox', { name: volume === 'descent' ? 'CONTROL chapter' : studio ? 'World chapter' : 'Chapter' })
    .selectOption({ label: chapter });
}

const numberAttribute = (canvas: Locator, name: string) => canvas.getAttribute(name).then(Number);

async function checkNarrowLayout(page: Page) {
  await page.setViewportSize({ width: 360, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
}

for (const volume of volumes) {
  test(`${volume} World Explorer renders and flies through the production scene`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/debug/worlds/?vol=${volume}&q=low`);
    await expect(page.locator('main canvas')).toHaveCount(0);
    const canvas = await openScene(page);
    await expect(canvas).toHaveAttribute('data-volume', volume);
    await expect(canvas).toHaveAttribute('data-quality', 'low');
    const initial = await numberAttribute(canvas, 'data-station');
    await chooseChapter(page, volume);
    await expect.poll(() => numberAttribute(canvas, 'data-station')).toBeGreaterThan(initial + 50);
    const checkpoint = await numberAttribute(canvas, 'data-station');
    const station = page.getByRole('slider', { name: 'World station' });
    await station.fill(String(checkpoint - 30));
    await expect.poll(() => numberAttribute(canvas, 'data-station')).toBeCloseTo(checkpoint - 30, 1);
    if (volume === 'daybreak') {
      await page.getByLabel('Camera view').selectOption({ label: 'Cloud Sea' });
      await page.getByLabel('Cirrus layers').selectOption({ index: 1 });
      await expect.poll(() => numberAttribute(canvas, 'data-camera-y')).toBeGreaterThan(8);
    } else if (volume === 'descent') {
      await page.getByLabel('Transfer chamber').selectOption({ label: 'Challenge guideway' });
      await expect(canvas).toHaveAttribute('data-route', 'challenge');
      await page.getByLabel('View angle').fill('12');
    } else if (volume === 'elsewhere') {
      await page.getByText('Corridor camera and S-Curve', { exact: true }).click();
      await page.getByRole('button', { name: 'First lateral peak' }).click();
      await page.getByLabel('Camera yaw').fill('12');
    } else {
      await page.getByLabel('Aurora structure').selectOption({ label: 'Neutral Density' });
      await expect(page.locator('[data-orbit-metrics]')).toContainText('nebula');
    }
    for (const quality of ['high', 'auto']) {
      await page.getByRole('combobox', { name: 'Quality', exact: true }).selectOption(quality);
      await expect(canvas).toHaveAttribute('data-quality', quality);
    }
    await canvas.screenshot({ path: info.outputPath(`world-${volume}.png`) });
    const start = await numberAttribute(canvas, 'data-station');
    await page.getByRole('button', { name: volume === 'orbit' ? 'Fly' : 'Play flight', exact: true }).click();
    await expect.poll(() => numberAttribute(canvas, 'data-station')).toBeGreaterThan(start + 1);
    await page.getByRole('button', { name: /^(Pause|Pause flight)$/ }).click();
    const stopped = await numberAttribute(canvas, 'data-station');
    await expect.poll(() => numberAttribute(canvas, 'data-station')).toBeCloseTo(stopped, 1);
    await expect(page.getByRole('link', { name: 'Open in game', exact: true })).toHaveAttribute('href', new RegExp(`^/\\?vol=${volume}&t=`));
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect.poll(() => numberAttribute(canvas, 'data-station')).toBeCloseTo(initial, 0);
    await checkNarrowLayout(page);
    expect(errors).toEqual([]);
  });

  test(`${volume} Lighting Studio keeps the production world and score independent`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/debug/lighting/?vol=${volume}&q=low&beat=16`);
    const canvas = await openScene(page);
    await expect(canvas).toHaveAttribute('data-volume', volume);
    await expect(canvas).toHaveAttribute('data-light-beat', /^16\.0+$/);
    const station = await canvas.getAttribute('data-station');
    const before = await canvas.screenshot();
    const beat = page.getByRole('slider', { name: 'Music beat' });
    await beat.fill('168');
    await expect(canvas).toHaveAttribute('data-light-beat', /^168\.0+$/);
    await expect(canvas).toHaveAttribute('data-station', station!);
    expect((await canvas.screenshot({ path: info.outputPath(`light-${volume}.png`) })).equals(before)).toBe(false);
    await chooseChapter(page, volume, true);
    await expect(canvas).not.toHaveAttribute('data-station', station!);
    await expect(canvas).toHaveAttribute('data-light-beat', /^168\.0+$/);
    const dynamic = page.getByLabel('Dynamic lighting', { exact: true });
    if (volume === 'elsewhere' || volume === 'daybreak') await dynamic.selectOption('off');
    else await dynamic.uncheck();
    await page.getByLabel('Reduced motion', { exact: true }).check();
    await expect(canvas).toHaveAttribute('data-reduced-motion', 'true');
    await checkNarrowLayout(page);
    expect(errors).toEqual([]);
  });
}

test('both labs fit each required viewport and only retain their own live context', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const contexts = new Set<WebGL2RenderingContext>();
    const audio = new Set<AudioContext>();
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      const context = Reflect.apply(original, this, [type, ...args]);
      if (type === 'webgl2' && context) contexts.add(context);
      return context;
    } as typeof original;
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args, constructor) {
        const context = Reflect.construct(target, args, constructor);
        audio.add(context);
        return context;
      },
    });
    window.addEventListener('read-live-resources', () => {
      document.documentElement.dataset.liveResources = JSON.stringify({
        active: [...contexts].filter(context => !context.isContextLost()).length,
        running: [...audio].filter(context => context.state === 'running').length,
        open: [...audio].filter(context => context.state !== 'closed').length,
      });
    });
  });
  const resources = () => page.evaluate(() => {
    window.dispatchEvent(new Event('read-live-resources'));
    return JSON.parse(document.documentElement.dataset.liveResources!);
  });
  await page.goto('/debug/worlds/?vol=elsewhere&q=low');
  await expect.poll(resources).toEqual({ active: 0, running: 0, open: 0 });
  const navigation = page.getByRole('navigation', { name: 'Explorer', exact: true });
  for (const lab of ['Worlds', 'Lighting'] as const) {
    if (lab === 'Lighting') {
      await navigation.getByRole('link', { name: lab, exact: true }).click();
      await expect.poll(resources).toEqual({ active: 0, running: 0, open: 0 });
    }
    const canvas = await openScene(page);
    for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540], [390, 844], [360, 760]]) {
      await page.setViewportSize({ width, height });
      const size = (await canvas.boundingBox())!;
      expect(size.width / size.height).toBeCloseTo(16 / 9, 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await expect(navigation.getByRole('link', { name: 'Audio' })).toBeVisible();
      if (width === 1280 || width === 390) {
        await page.screenshot({ path: info.outputPath(`${lab}-${width}.png`), fullPage: true });
      }
    }
    await expect.poll(resources).toEqual({ active: 1, running: 0, open: 0 });
  }
  await page.getByRole('combobox', { name: 'Volume', exact: true }).selectOption('descent');
  await expect(page.locator('main canvas')).toHaveCount(0);
  await expect.poll(resources).toEqual({ active: 0, running: 0, open: 0 });
  const facility = await openScene(page);
  await page.getByRole('button', { name: 'Play lighting', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause lighting' })).toBeVisible();
  await expect.poll(() => resources().then(value => value.running)).toBe(1);
  await expect(facility).toHaveCount(1);
  await navigation.getByRole('link', { name: 'Worlds', exact: true }).click();
  await expect.poll(resources).toEqual({ active: 0, running: 0, open: 0 });
  await navigation.getByRole('link', { name: 'Audio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Audio Inspector', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect.poll(() => resources().then(value => value.active)).toBe(0);
});

test('migrated hashes and numeric deep links open the corresponding live experiments', async ({ page }) => {
  for (const [hash, lab, volume] of [
    ['volumes', 'worlds', 'elsewhere'], ['daybreak-cabin', 'worlds', 'daybreak'], ['environment', 'worlds', 'daybreak'],
    ['descent', 'worlds', 'descent'], ['orbit', 'worlds', 'orbit'], ['lighting', 'lighting', 'elsewhere'],
    ['s-curve', 'lighting', 'elsewhere'], ['beat-inspection', 'lighting', 'elsewhere'],
  ]) {
    await page.goto(`/debug/?q=low&station=4222&beat=84#${hash}`);
    await expect(page.getByRole('button', { name: 'Open live scene' })).toBeVisible();
    expect(await page.evaluate(() => location.pathname)).toBe(`/debug/${lab}/`);
    expect(await page.evaluate(() => location.hash)).toBe('#' + hash);
    await expect(page.getByRole('combobox', { name: 'Volume', exact: true })).toHaveValue(volume);
    expect(new URL(page.url()).searchParams.get('station')).toBe('4222');
    if (volume !== 'orbit') await expect(page.getByRole('slider', { name: 'World station' })).toHaveValue('4222');
  }
  await page.goto('/debug/legacy/?vol=elsewhere&q=low&station=4320&beat=302#orbit');
  const orbit = await openScene(page);
  await expect(orbit).toHaveAttribute('data-station', '4320.000');
  await expect(orbit).toHaveAttribute('data-light-beat', /^302\.0+$/);
});
