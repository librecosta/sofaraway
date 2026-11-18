import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { branchLayout, ROUTE_LABELS } from '../../app/game/core/branches';
import { lanePoint, RANGE_X, RANGE_Y } from '../../app/game/core/collision';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import type { Graphics } from '../../app/game/graphics/scene.client';

type Metrics = ReturnType<Graphics['metrics']>;
const canvas = (page: Page) => page.getByLabel('ASTRAL BELT flight');
const info = (page: Page) => page.locator('[data-orbit-metrics]');
const seek = (page: Page) => page.getByRole('slider', { name: /World station/ });
const station = async (page: Page) => Number(await seek(page).inputValue());
const metrics = async (page: Page): Promise<Metrics> => JSON.parse((await info(page).getAttribute('data-orbit-metrics'))!);
const glError = (page: Page) => canvas(page).evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError());

test('the public ORBIT run recovers WebGL, judges a Hard collision and retries on the same canvas', async ({ page }) => {
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
  const gl = page.locator('canvas#gl');
  const element = await gl.elementHandle();
  await expect(page.locator('#vol-name')).toContainText('ORBIT');
  await page.getByRole('button', { name: 'Next difficulty' }).click();
  await expect(page.locator('#diff [data-selected=true]')).toHaveText('HARD');
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud-lives i')).toHaveCount(1);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toBeVisible();
  const score = page.locator('#hud-score');
  const held = await score.textContent();
  await page.waitForTimeout(200);
  await expect(score).toHaveText(held!);
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(score).not.toHaveText(held!);
  await gl.evaluate((el: HTMLCanvasElement) => {
    const ext = el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    el.addEventListener('webglcontextrestored', () => { el.dataset.restored = 'true'; }, { once: true });
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 900);
  });
  await expect(gl).toHaveAttribute('data-restored', 'true');
  const resume = page.getByRole('button', { name: 'RESUME', exact: true });
  if (await resume.isVisible()) await resume.click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await gl.evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError())).toBe(0);
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width / 2, height / 2);
  await expect(page.locator('#over')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#over-title')).toHaveText('TERMINATED', { timeout: 15_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sofaraway.records.v1')!).standard.orbit.normal.best)).toBe(91);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sofaraway.records.v1')!).standard['orbit-astral-playable-v1'].hard.last.outcome)).toBe('TERMINATED');
  await page.locator('[data-act=restart]').click();
  await expect(page.locator('#hud-lives i')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.getByRole('button', { name: 'Next volume' }).click();
  await expect(page.locator('#vol-name')).toContainText('ELSEWHERE');
  expect(await element!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);
  expect(errors).toEqual([]);
});

test('Debug renders deterministic rock coverage across density changes, chunk eviction and quality switches', async ({ page }) => {
  await page.goto('/debug/?q=low#orbit');
  const orbit = page.locator('#orbit');
  await orbit.getByRole('button', { name: 'Open flight preview' }).click();
  await expect(info(page)).toBeVisible({ timeout: 20_000 });
  await orbit.getByRole('button', { name: 'Sparse view' }).click();
  const origin = await seek(page).inputValue();
  const sparse = await metrics(page);
  await orbit.getByRole('combobox', { name: 'Density' }).selectOption('dense');
  await expect.poll(async () => (await metrics(page)).orbit!.instances).toBeGreaterThan(sparse.orbit!.instances * 1.5);
  const dense = await metrics(page);
  const picture = await canvas(page).screenshot();
  await seek(page).focus();
  await page.keyboard.press('End');
  await expect(seek(page)).not.toHaveValue(origin);
  await expect.poll(async () => (await metrics(page)).orbit!.instances).not.toBe(dense.orbit!.instances);
  await seek(page).evaluate((el: HTMLInputElement, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, origin);
  await expect(seek(page)).toHaveValue(origin);
  await expect.poll(async () => (await metrics(page)).orbit!.instances).toBe(dense.orbit!.instances);
  expect(await canvas(page).screenshot()).toEqual(picture);
  await orbit.getByRole('combobox', { name: 'Quality' }).selectOption('high');
  await expect.poll(async () => (await metrics(page)).orbit!.lod[0]).toBeGreaterThanOrEqual(dense.orbit!.lod[0]);
  expect((await metrics(page)).orbit!.descriptions).toBe(dense.orbit!.descriptions);
  expect(await glError(page)).toBe(0);
});

for (const [seed, side, boost] of [[0, 'left', true], [0, 'right', false], [1, 'left', false], [1, 'center', false]] as const) {
  const route = branchLayout(seed)[side];
  test(`live ORBIT enters and merges ${route} on the ${side} with manual steering`, async ({ page }, info) => {
    const sim = new Simulation(volumeById('orbit'));
    sim.start('normal', seed);
    const junction = sim.junctionPath!;
    const lead = sim.mainGates.filter(gate => gate.worldStation < junction.split).at(-1)!;
    const exit = sim.mainGates.find(gate => gate.worldStation >= junction.end)!;
    const routeGates = sim.branchGates![route];
    await page.goto('http://127.0.0.1:8090/');
    const initial = await page.evaluate(async seed => {
      const runtime = window.b0Harness;
      await runtime.mount({ volumeId: 'orbit', runSeed: seed, quality: 'low', diagnostics: {
        fixedTime: null, autoplay: false, god: false, align: true, boost: false,
        mobileQuality: false, post: true, record: false, debug: true,
      } });
      await runtime.start(true);
      runtime.advanceAndPause(305, true);
      await runtime.resume(true);
      return runtime.snapshot().gatesPassed;
    }, seed);
    const state = () => page.evaluate(() => window.b0Harness.branchState());
    const snap = () => page.evaluate(() => window.b0Harness.snapshot());
    const { width, height } = page.viewportSize()!;
    const aim = (x: number, y: number) => page.mouse.move(width * (1 + x / RANGE_X) / 2, height * (1 - y / RANGE_Y) / 2);
    const gateAim = (gate: typeof lead) => aim(...lanePoint(gate.kind, gate.open, gate.axis));
    const poll = <T>(query: () => Promise<T>) => expect.poll(query, { intervals: [20, 40, 50] });
    await aim(0, 1);
    await poll(async () => (await state()).pickup?.status).toBe('collected');
    await gateAim(lead);
    await poll(async () => (await snap()).gatesPassed).toBe(initial + 1);
    if (boost) await page.keyboard.down('Shift');
    await poll(async () => (await state()).metrics.routeHologram?.left).toBe(ROUTE_LABELS[branchLayout(seed).left]);
    const recognition = await state();
    expect(recognition.branch?.side).toBeNull();
    await page.locator('canvas').screenshot({ path: info.outputPath('orbit-approach.png') });
    if (side === 'center') await aim(0, 0);
    else {
      const key = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
      await page.keyboard.down(key);
      await poll(async () => (await state()).routeSide).toBe(side);
      await page.keyboard.up(key);
    }
    await poll(async () => (await state()).route).toBe(route);
    const committed = await state();
    expect(committed.trackDistance).toBeGreaterThanOrEqual(junction.split);
    expect(committed.time - recognition.time).toBeGreaterThan(1.5);
    for (const [index, gate] of routeGates.entries()) {
      await gateAim(gate);
      await poll(async () => (await snap()).gatesPassed).toBe(initial + 2 + index);
      if (!index) await page.locator('canvas').screenshot({ path: info.outputPath('orbit-branch.png') });
    }
    if (boost) await page.keyboard.up('Shift');
    await gateAim(exit);
    await poll(async () => (await state()).lastGate?.beat).toBe(exit.beat);
    await poll(async () => (await snap()).gatesPassed).toBe(initial + 2 + routeGates.length);
    expect(await snap()).toMatchObject({ phase: 'playing', lives: 2, gatesPassed: initial + 2 + routeGates.length });
    expect(await state()).toMatchObject({ sharedPath: true, metrics: { chunks: 0, junctionMeshes: 0 } });
    await page.evaluate(() => window.b0Harness.dispose());
  });
}

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
    await page.goto(`/debug/?density=dense&station=7470&q=${quality}#orbit`);
    await page.getByRole('button', { name: 'Open flight preview' }).click();
    await expect(info(page)).toBeVisible();
    const start = await metrics(page);
    const first = await seek(page).inputValue();
    await page.getByRole('button', { name: 'Fly', exact: true }).click();
    const samples = await canvas(page).evaluate(async (element: HTMLCanvasElement) => {
      const data: number[] = [];
      let last = await new Promise<number>(requestAnimationFrame);
      for (let i = 0; i < 40; i++) {
        const now = await new Promise<number>(requestAnimationFrame);
        data.push(now - last);
        last = now;
      }
      const gl = element.getContext('webgl2')!;
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
    await page.getByRole('link', { name: 'Play ORBIT' }).click();
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'orbitBuffers').released as number)).toBeGreaterThan(beforeExit);
  }
  console.log(JSON.stringify(summaries));
  await run.attach('ORBIT rendering metrics', { body: JSON.stringify(summaries, null, 2), contentType: 'application/json' });
});
