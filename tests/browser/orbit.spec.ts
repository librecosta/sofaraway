import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Graphics } from '../../app/game/graphics/scene.client';

type Metrics = ReturnType<Graphics['metrics']>;
const canvas = (page: Page) => page.getByLabel('ASTRAL BELT flight');
const info = (page: Page) => page.locator('[data-orbit-metrics]');
const seek = (page: Page) => page.getByRole('slider', { name: /World station/ });
const station = async (page: Page) => Number(await seek(page).inputValue());
const metrics = async (page: Page): Promise<Metrics> => JSON.parse((await info(page).getAttribute('data-orbit-metrics'))!);
const glError = (page: Page) => canvas(page).evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError());

test('the public ORBIT route opens a continuous flight, survives context loss and leaves legacy records intact', async ({ page }) => {
  await page.addInitScript(() => {
    const key = 'sofaraway.records.v1';
    if (!localStorage.getItem(key)) localStorage.setItem(key,
      JSON.stringify({ version: 1, standard: { orbit: { normal: { best: 91, last: { score: 91, outcome: 'ESCAPED' } } } } }));
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?vol=descent&q=low');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.getByRole('button', { name: 'Next volume' }).click();
  await expect(page).toHaveURL(/vol=orbit/);
  await expect(page.getByRole('heading', { name: 'ASTRAL BELT' })).toBeVisible();
  await expect.poll(() => station(page), { timeout: 20_000 }).toBeGreaterThan(30);
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => station(page), { timeout: 12_000 }).toBeGreaterThan(125);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Fly', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Dense view' }).click();
  await expect.poll(async () => (await metrics(page)).orbit?.instances).toBeGreaterThan(30);
  await expect(seek(page)).toHaveValue('1130');
  const before = await canvas(page).screenshot({ animations: 'disabled' });
  const baseline = await metrics(page);
  await canvas(page).evaluate((el: HTMLCanvasElement) => {
    const ext = el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 900);
  });
  await expect(page.getByText(/Waiting for WebGL recovery/)).toBeVisible();
  await expect(page.getByText(/Waiting for WebGL recovery/)).toBeHidden();
  await expect(seek(page)).toHaveValue('1130');
  expect((await metrics(page)).orbit).toEqual(baseline.orbit);
  expect(await canvas(page).screenshot({ animations: 'disabled' })).toEqual(before);
  expect(await glError(page)).toBe(0);
  await expect(page.locator('#hud')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sofaraway.records.v1')!).standard.orbit.normal.best)).toBe(91);
  await page.getByRole('link', { name: 'Game menu' }).click();
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await expect(canvas(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Debug renders deterministic rock coverage across density changes, chunk eviction and quality switches', async ({ page }) => {
  await page.goto('/debug/?q=low#orbit');
  const orbit = page.locator('#orbit');
  await orbit.getByRole('button', { name: 'Open flight preview' }).click();
  await expect(info(page)).toBeVisible({ timeout: 20_000 });
  await orbit.getByRole('button', { name: 'Sparse view' }).click();
  await expect(seek(page)).toHaveValue('140');
  const sparse = await metrics(page);
  await orbit.getByRole('combobox', { name: 'Density' }).selectOption('dense');
  await expect.poll(async () => (await metrics(page)).orbit!.instances).toBeGreaterThan(sparse.orbit!.instances * 1.5);
  const dense = await metrics(page);
  const picture = await canvas(page).screenshot();
  await seek(page).focus();
  await page.keyboard.press('End');
  await expect(seek(page)).toHaveValue('2500');
  await expect.poll(async () => (await metrics(page)).orbit!.instances).not.toBe(dense.orbit!.instances);
  await seek(page).evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '140');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(seek(page)).toHaveValue('140');
  await expect.poll(async () => (await metrics(page)).orbit!.instances).toBe(dense.orbit!.instances);
  expect(await canvas(page).screenshot()).toEqual(picture);
  await orbit.getByRole('combobox', { name: 'Quality' }).selectOption('high');
  await expect.poll(async () => (await metrics(page)).orbit!.lod[0]).toBeGreaterThanOrEqual(dense.orbit!.lod[0]);
  expect((await metrics(page)).orbit!.descriptions).toBe(dense.orbit!.descriptions);
  expect(await glError(page)).toBe(0);
});

test('@perf ORBIT streams dense chunks at Low, Auto and High and releases instance buffers', async ({ page }, run) => {
  await page.addInitScript(() => {
    const gl = WebGL2RenderingContext.prototype;
    const { createBuffer, deleteBuffer } = gl;
    const tracked = new Set<WebGLBuffer>();
    const state = { created: 0, released: 0 };
    Reflect.set(window, 'orbitBuffers', state);
    gl.createBuffer = function () {
      const buffer = createBuffer.call(this);
      if (buffer) { tracked.add(buffer); state.created++; }
      return buffer;
    };
    gl.deleteBuffer = function (buffer) {
      if (buffer && tracked.delete(buffer)) state.released++;
      deleteBuffer.call(this, buffer);
    };
  });
  const summaries = [];
  for (const [quality, width, height] of [['low', 960, 540], ['auto', 1280, 720], ['high', 1920, 1080]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/?vol=orbit&density=dense&station=1120&q=${quality}`);
    await expect(info(page)).toBeVisible();
    const start = await metrics(page);
    const first = await seek(page).inputValue();
    await page.getByRole('button', { name: 'Fly', exact: true }).click();
    const samples = await page.evaluate(async () => {
      const data: number[] = [];
      let last = await new Promise<number>(requestAnimationFrame);
      for (let i = 0; i < 40; i++) {
        const now = await new Promise<number>(requestAnimationFrame);
        data.push(now - last);
        last = now;
      }
      const gl = document.querySelector('canvas')!.getContext('webgl2')!;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { frames: data.sort((a, b) => a - b), renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    });
    await page.getByRole('button', { name: 'Pause flight' }).click();
    expect(await station(page)).toBeGreaterThan(Number(first));
    expect(await glError(page)).toBe(0);
    const finish = await metrics(page);
    summaries.push({ quality, viewport: [width, height], canvas: finish.canvas, renderer: samples.renderer,
      gpuTimerAvailable: samples.timerQuery, medianMs: samples.frames[20], p95Ms: samples.frames[37],
      calls: finish.calls, triangles: finish.triangles, programs: finish.programs, geometries: finish.geometries,
      textures: finish.textures, loadedChunks: finish.orbit!.chunks, instances: finish.orbit!.instances });
    expect(finish.orbit!.chunks).toBeLessThan(start.orbit!.chunks * 1.6);
    await seek(page).focus();
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'orbitBuffers').released)).toBeGreaterThan(0);
    const beforeExit = await page.evaluate(() => Reflect.get(window, 'orbitBuffers').released as number);
    await page.getByRole('link', { name: 'Game menu' }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'orbitBuffers').released as number)).toBeGreaterThan(beforeExit);
  }
  console.log(JSON.stringify(summaries));
  await run.attach('ORBIT rendering metrics', { body: JSON.stringify(summaries, null, 2), contentType: 'application/json' });
});
