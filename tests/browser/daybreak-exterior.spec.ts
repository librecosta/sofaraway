import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { sections } from '../../app/game/core/daybreak-score';
import type {} from '../harness/main';

interface ExteriorMetrics { seaLevel: number; sun: number[]; atmosphere: number[]; detail: number }

async function imageSamples(canvas: Locator, image: Buffer, points: [number, number][]) {
  return canvas.evaluate(async (_, { png, points }) => {
    const picture = await createImageBitmap(new Blob([Uint8Array.from(atob(png), byte => byte.charCodeAt(0))], { type: 'image/png' }));
    const sample = new OffscreenCanvas(picture.width, picture.height).getContext('2d')!;
    sample.drawImage(picture, 0, 0);
    picture.close();
    return points.map(([x, y]) => {
      const pixels = sample.getImageData(Math.floor(x * sample.canvas.width), Math.floor(y * sample.canvas.height), 11, 11).data;
      const rgb = [0, 0, 0];
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) rgb[c] += pixels[i + c];
      return rgb.map(value => value / 121);
    });
  }, { png: image.toString('base64'), points });
}

test('DAYBREAK exterior chapter timing follows the soundtrack with cruise, Boost and Sightseeing', async ({ page }) => {
  const diagnostics = page.locator('#errbox');
  const looks = [];
  for (const profile of ['mode=standard&q=low', 'mode=standard&boost=1&q=auto&lights=true', 'mode=sightseeing&q=high']) {
    await page.goto(`/?vol=daybreak&t=96&align=1&god=0&dbg=1&${profile}`);
    await expect(diagnostics).toContainText('"renderedVolume":"daybreak"');
    const metrics = await diagnostics.evaluate(el => JSON.parse(el.textContent!) as { exterior: ExteriorMetrics; distance: number });
    looks.push(metrics);
  }
  expect(new Set(looks.map(look => look.distance)).size).toBe(3);
  expect(looks.map(look => look.exterior.detail)).toEqual([0, .55, 1]);
  for (const look of looks) {
    expect(look.exterior.atmosphere).toEqual(looks[0].exterior.atmosphere);
    expect(look.exterior.sun).toEqual(looks[0].exterior.sun);
    expect(Math.hypot(...look.exterior.sun)).toBeCloseTo(1);
    expect(look.exterior.sun[1]).toBeCloseTo(.1483, 4);
    expect(look.exterior.seaLevel).toBe(-22);
  }
  for (const id of ['elsewhere', 'descent']) {
    await page.goto(`/?vol=${id}&t=4&q=low&align=1&dbg=1`);
    await expect(diagnostics).toContainText(`"renderedVolume":"${id}"`);
    await expect(diagnostics).not.toContainText('"exterior":');
  }
});

test('the production canopy reflects world sunlight consistently under camera roll', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const { facing, rolled, away } = await page.evaluate(() => window.b0Harness.inspectCanopySunlight());
  expect(facing[0] - away[0]).toBeGreaterThan(15);
  expect(Math.max(...facing.map((value, channel) => Math.abs(value - rolled[channel])))).toBeLessThanOrEqual(2);
});

test('cirrus remains on the same world ray through travel, roll, turning and Boost FOV', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const { main, secondary, composite, rolled, boosted, tiers, dawn, sunburst, released, error } =
    await page.evaluate(() => window.b0Harness.inspectCirrusDirection());
  const difference = (a: number[], b: number[]) => Math.max(...a.map((channel, i) => Math.abs(channel - b[i])));
  expect(difference(main, secondary)).toBeGreaterThan(10);
  expect(difference(composite, rolled)).toBeLessThanOrEqual(1);
  expect(difference(composite, boosted)).toBeLessThanOrEqual(3);
  for (const sample of tiers) expect(difference(main, sample)).toBeLessThanOrEqual(4);
  expect(released).toBe(2);
  expect(error).toBe(0);
  for (const [facing, away] of [dawn, sunburst]) {
    expect(facing[0] - away[0]).toBeGreaterThan(70);
    expect(away[2] - away[0]).toBeGreaterThan(75);
  }
  expect(sunburst[0][0] - sunburst[0][2]).toBeGreaterThan(dawn[0][0] - dawn[0][2]);
});

test('DAYBREAK reuses its cabin reflections and releases them on switch and teardown', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const resources = await page.evaluate(() => window.b0Harness.inspectDaybreakReflections());
  expect(resources).toEqual({ supported: true, reused: true, switched: true, recreated: true, released: 2, error: 0 });
});

test('End Sequence Studio renders the production sky, cloud sea and recovered context', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/debug/#outro');
  const studio = page.locator('#outro');
  const button = (name: string) => studio.getByRole('button', { name, exact: true });
  await button('Open live ending').click();
  await expect(studio.getByRole('img', { name: 'Live ELSEWHERE ending' })).toHaveAttribute('data-exterior', 'null');
  await studio.getByLabel('World', { exact: true }).selectOption('daybreak');
  const canvas = studio.getByRole('img', { name: 'Live DAYBREAK ending' });
  const view = studio.getByLabel('Exterior view', { exact: true });
  for (const { name, startBeat, endBeat } of sections) {
    await button(`${name} Atmosphere`).click();
    await expect(canvas).toHaveAttribute('data-beat', ((startBeat + endBeat) / 2).toFixed(3));
  }
  await button('BREEZE Atmosphere').click();
  await view.selectOption({ label: 'Look Up' });
  const up = await canvas.screenshot();
  const [blue] = await imageSamples(canvas, up, [[.32, .2]]);
  expect(blue[2] - blue[0]).toBeGreaterThan(30);
  const layer = studio.getByLabel('Cirrus layers');
  let previous = up;
  for (const label of ['Main Only', 'Secondary Only', 'Composite']) {
    await layer.selectOption({ label });
    const isolated = await canvas.screenshot();
    expect(isolated.equals(previous)).toBe(false);
    await info.attach(`BREEZE · ${label}`, { body: isolated, contentType: 'image/png' });
    previous = isolated;
  }
  expect(previous.equals(up)).toBe(true);
  await view.selectOption({ label: 'Cloud Sea' });
  await expect(canvas).toHaveAttribute('data-camera-y', '19');
  const sea = await canvas.screenshot();
  const points: [number, number][] = [[.1, .46], [.21, .47], [.22, .69], [.67, .52], [.78, .62], [.88, .70], [.72, .85]];
  const clouds = await imageSamples(canvas, sea, points);
  const cloudLevel = clouds.map(([r, g, b]) => .2126 * r + .7152 * g + .0722 * b);
  expect(Math.max(...cloudLevel) - Math.min(...cloudLevel)).toBeGreaterThan(8);
  expect(cloudLevel.every(value => value > 45 && value < 244)).toBe(true);
  const darkest = cloudLevel.indexOf(Math.min(...cloudLevel));
  const brightest = cloudLevel.indexOf(Math.max(...cloudLevel));
  expect(clouds[darkest][2] - clouds[darkest][0]).toBeGreaterThan(8);
  expect(clouds[brightest][2] - clouds[brightest][0]).toBeLessThan(clouds[darkest][2] - clouds[darkest][0]);
  const quality = studio.getByLabel('Preview quality');
  // Reduced detail keeps the same sunward bank and adjacent valley.
  for (const [tier, detail] of [['low', 0], ['auto', .55]] as const) {
    await quality.selectOption(tier);
    await expect(canvas).toHaveAttribute('data-exterior', new RegExp(`"detail":${detail}}`));
    const [valley, bank] = await imageSamples(canvas, await canvas.screenshot(), [points[darkest], points[brightest]]);
    expect(bank[1] - valley[1]).toBeGreaterThan(4);
  }
  await quality.selectOption('high');
  await expect(canvas).toHaveAttribute('data-exterior', /"detail":1}/);
  await info.attach('BREEZE · Sky', { body: up, contentType: 'image/png' });
  await info.attach('BREEZE · Cloud sea', { body: sea, contentType: 'image/png' });
  const original = await canvas.elementHandle();
  const gl = await canvas.evaluateHandle((el: HTMLCanvasElement) => el.getContext('webgl2')!);
  expect(await gl.evaluate(context => context.getError())).toBe(0);
  const loss = await gl.evaluateHandle(context => context.getExtension('WEBGL_lose_context')!);
  await loss.evaluate(extension => extension.loseContext());
  const interrupted = studio.getByText('WebGL interrupted. Waiting to restore the ending.');
  await expect(interrupted).toBeVisible();
  await loss.evaluate(extension => extension.restoreContext());
  await expect(interrupted).toHaveCount(0);
  const restored = await imageSamples(canvas, await canvas.screenshot(), points);
  expect(Math.max(...restored.flatMap((rgb, i) => rgb.map((value, c) => Math.abs(value - clouds[i][c]))))).toBeLessThan(3);
  await view.selectOption({ label: 'Look Up' });
  const skyPoints: [number, number][] = [[.28, .48], [.47, .45], [.66, .42], [.84, .38]];
  const sky = await imageSamples(canvas, up, skyPoints);
  const restoredSky = await imageSamples(canvas, await canvas.screenshot(), skyPoints);
  expect(Math.max(...restoredSky.flatMap((rgb, i) => rgb.map((value, c) => Math.abs(value - sky[i][c]))))).toBeLessThan(3);
  for (const volume of ['elsewhere', 'daybreak', 'elsewhere', 'daybreak']) {
    await studio.getByLabel('World', { exact: true }).selectOption(volume);
    await expect(studio.getByRole('img')).toHaveAttribute('data-exterior', volume === 'elsewhere' ? 'null' : /"seaLevel":-22/);
  }
  expect(await canvas.evaluate((el, initial) => el === initial, original)).toBe(true);
  await button('Close live ending').click();
  await expect(canvas).toHaveCount(0);
  await expect.poll(() => gl.evaluate(context => context.isContextLost())).toBe(true);
  await gl.dispose();
  await loss.dispose();
  await original!.dispose();
  expect(errors).toEqual([]);
});
