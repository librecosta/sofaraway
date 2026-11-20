import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { branchLayout, ROUTE_LABELS } from '../../app/game/core/branches';
import { lanePoint, RANGE_X, RANGE_Y } from '../../app/game/core/collision';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import type { Graphics } from '../../app/game/graphics/scene.client';

type Metrics = ReturnType<Graphics['metrics']>;
test.use({ video: { mode: 'on', size: { width: 960, height: 540 } } });
const canvas = (page: Page) => page.getByLabel('ASTRAL BELT flight');
const info = (page: Page) => page.locator('[data-orbit-metrics]');
const seek = (page: Page) => page.getByRole('slider', { name: /World station/ });
const station = async (page: Page) => Number(await seek(page).inputValue());
const metrics = async (page: Page): Promise<Metrics> => JSON.parse((await info(page).getAttribute('data-orbit-metrics'))!);
const glError = (page: Page) => canvas(page).evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError());

test('ORBIT fixed landmarks have no beat zoom with or without PostFX; the other volumes retain their lenses', async ({ page }, run) => {
  await page.goto('http://127.0.0.1:8090/');
  const results = [];
  for (const post of [false, true]) for (const motion of ['cruise', 'boost'] as const) {
    const sample = await page.evaluate(options => window.b0Harness.inspectOrbitStability(options),
      { quality: 'high' as const, post, motion, beat: 20, frozen: true });
    const fovs = sample.frames.map(frame => frame.fov);
    expect(Math.max(...fovs) - Math.min(...fovs)).toBeLessThan(1e-9);
    expect(new Set(sample.frames.slice(1).map(frame => JSON.stringify(frame.metrics.orbit))).size).toBe(1);
    expect(sample).toMatchObject({ moved: 0, glError: 0 });
    expect(sample.landmarks).toBeGreaterThan(0);
    results.push({ post, motion, fov: fovs[0], landmarks: sample.landmarks });
  }
  for (const volume of ['elsewhere', 'daybreak', 'descent'] as const) {
    const sample = await page.evaluate(volume => window.b0Harness.inspectOrbitStability({ quality: 'low', post: false,
      motion: 'cruise', beat: 20, frozen: true, frames: 120, volume }), volume);
    const fovs = sample.frames.map(frame => frame.fov), range = Math.max(...fovs) - Math.min(...fovs);
    if (volume === 'daybreak') expect(range).toBe(0);
    else expect(range).toBeGreaterThan(.64);
  }
  await run.attach('Stable camera isolation', { body: JSON.stringify(results), contentType: 'application/json' });
});

test('ORBIT streams stable landmarks through cruise, Boost and mixed input across its belts', async ({ page }, run) => {
  await page.goto('http://127.0.0.1:8090/');
  const results = [];
  for (const [quality, motion, beat] of [['low', 'cruise', 20], ['auto', 'boost', 116], ['high', 'mixed', 192],
    ['auto', 'cruise', 280], ['high', 'boost', 360]] as const) {
    const sample = await page.evaluate(options => window.b0Harness.inspectOrbitStability(options), { quality, motion, beat, frames: 240, post: true });
    expect(sample).toMatchObject({ moved: 0, glError: 0 });
    const frames = sample.frames;
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].station).toBeGreaterThanOrEqual(frames[i - 1].station);
      // Boost retains the shared 180 ms eased response; there is no beat term.
      expect(frames[i].fov).toBeCloseTo(76 + frames[i].boostLens * 7 + Math.min(frames[i].speed, 56) * .045 + frames[i].steeringWidth, 7);
      expect(Math.abs(frames[i].fov - frames[i - 1].fov)).toBeLessThan(.8);
      expect(frames[i].metrics.orbit!.chunks).toBeLessThan(700);
    }
    results.push({ quality, motion, beat, first: frames[0], last: frames.at(-1) });
  }
  await run.attach('Astral continuous flight', { body: JSON.stringify(results), contentType: 'application/json' });
});

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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sofaraway.records.v1')!).standard['orbit-starwake-aperture-v1'].hard.last.outcome)).toBe('TERMINATED');
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

test('the gate library renders all aperture presets and exposes their thick sidewalls', async ({ page }, run) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/debug/#gates-orbit');
  const group = page.locator('#gates-orbit');
  for (const [label, kind, count] of [['Single Aperture', 'orbit-single', 12], ['Dual Aperture', 'orbit-dual', 6],
    ['Triple Aperture', 'orbit-triple', 6]] as const) {
    const select = group.getByRole('combobox', { name: `${label} opening` });
    await expect(select).toBeEnabled();
    await expect(select.locator('option')).toHaveCount(count);
    for (let i = 0; i < count; i++) {
      await select.selectOption(String(i));
      await expect(group.locator(`canvas[data-preview=${kind}]`)).toHaveAttribute('data-rendered-opening', String(i));
    }
    await select.selectOption(kind === 'orbit-single' ? '10' : '0');
  }
  await group.screenshot({ path: run.outputPath('apertures-front.png') });
  await group.getByRole('slider', { name: 'ORBIT specimen angle' }).evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '65');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await group.getByRole('combobox', { name: 'ORBIT specimen framing' }).selectOption('close');
  await group.screenshot({ path: run.outputPath('apertures-throat.png') });
  expect(errors).toEqual([]);
});

test('STARWAKE runs for its complete body and tail through real boosted gameplay, Encore and Results', async ({ page }, run) => {
  test.setTimeout(215_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('http://127.0.0.1:8090/');
  await page.evaluate(async () => {
    await window.b0Harness.mount({ volumeId: 'orbit', quality: 'low', difficulty: 'impossible', runSeed: 0,
      diagnostics: { fixedTime: null, autoplay: false, align: true, god: false, boost: true,
        mobileQuality: false, post: true, record: false, debug: true } });
    await window.b0Harness.start(false);
  });
  await page.keyboard.down('Shift');
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().boosting)).toBe(true);
  expect(await page.evaluate(() => window.b0Harness.audioState())).toMatchObject({ starwake: true, context: 'running' });
  const moments = [];
  for (const beat of [16, 64, 112, 192, 240, 272, 336, 380]) {
    await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().progress), { timeout: 55_000, intervals: [250] }).toBeGreaterThanOrEqual(beat / 384);
    const moment = await page.evaluate(() => ({ snapshot: window.b0Harness.snapshot(), scene: window.b0Harness.branchState(),
      audio: window.b0Harness.audioState() }));
    expect(moment.snapshot.phase).toBe('playing');
    expect(moment.audio).toMatchObject({ starwake: true, context: 'running' });
    expect(moment.scene.metrics.chunks).toBe(0);
    expect(moment.scene.metrics.gateGeometryCache).toBeLessThanOrEqual(24);
    if (beat >= 336) expect(moment.scene.metrics.orbit!.setpieces.active.some(piece=>piece.id==='planet')).toBe(true);
    await page.locator('canvas').screenshot({ path: run.outputPath(`starwake-${beat}.png`) });
    moments.push(moment);
  }
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot().phase), { timeout: 12_000 }).toBe('results');
  const finish = await page.evaluate(() => ({ snapshot: window.b0Harness.snapshot(), scene: window.b0Harness.branchState(), audio: window.b0Harness.audioState() }));
  expect(finish.snapshot.result).toMatchObject({ title: 'ESCAPED', accuracy: 1 });
  expect(finish.snapshot.encore).toMatchObject({ missed: 0, neutralized: 0 });
  expect(finish.snapshot.encore!.passed).toBeGreaterThan(20);
  expect(finish.scene.time).toBeGreaterThanOrEqual(180);
  expect(finish.audio.tailRemaining).toBeGreaterThan(2.5);
  await expect.poll(() => page.evaluate(() => window.b0Harness.audioState().active), { timeout: 5000 }).toBe(false);
  expect(finish.scene.trackDistance + 400).toBeLessThan((await page.evaluate(() => window.b0Harness.corridor()!.length))!);
  expect(errors).toEqual([]);
  await run.attach('STARWAKE continuous run', { body: JSON.stringify({ moments, finish }, null, 2), contentType: 'application/json' });
  await page.evaluate(() => window.b0Harness.dispose());
});

for (const [seed, side, boost, mode, difficulty] of [[0, 'left', true, 'standard', 'normal'], [0, 'right', false, 'standard', 'normal'],
  [1, 'left', false, 'standard', 'normal'], [1, 'center', false, 'standard', 'normal'], [1, 'right', true, 'standard', 'normal'],
  [0, 'center', false, 'standard', 'normal'], [0, 'right', true, 'standard', 'impossible'], [1, 'right', false, 'sightseeing', 'normal']] as const) {
  const route = branchLayout(seed)[side];
  const modeLabel = mode === 'standard' && difficulty === 'normal' ? '' : ` ${mode} ${difficulty}`;
  test(`live ORBIT enters and merges ${route} on the ${side} with manual steering (seed ${seed})${modeLabel}`, async ({ page }, info) => {
    const sim = new Simulation(volumeById('orbit'));
    sim.start(difficulty, seed, undefined, mode);
    const junction = sim.junctionPath!;
    const lead = sim.mainGates.filter(gate => gate.worldStation < junction.split).at(-1)!;
    const exit = sim.mainGates.find(gate => gate.worldStation >= junction.end)!;
    const routeGates = sim.branchGates![route];
    await page.goto('http://127.0.0.1:8090/');
    const initial = await page.evaluate(async ({ seed, mode, difficulty }) => {
      const runtime = window.b0Harness;
      await runtime.mount({ volumeId: 'orbit', runSeed: seed, mode, difficulty, quality: 'low', diagnostics: {
        fixedTime: null, autoplay: false, god: false, align: true, boost: false,
        mobileQuality: false, post: true, record: false, debug: true,
      } });
      await runtime.start(true);
      runtime.advanceAndPause(100, true);
      await runtime.resume(true);
      return runtime.snapshot().gatesPassed;
    }, { seed, mode, difficulty });
    const state = () => page.evaluate(() => window.b0Harness.branchState());
    const snap = () => page.evaluate(() => window.b0Harness.snapshot());
    const { width, height } = page.viewportSize()!;
    const aim = (x: number, y: number) => page.mouse.move(width * (1 + x / RANGE_X) / 2, height * (1 - y / RANGE_Y) / 2);
    const gateAim = (gate: typeof lead) => aim(...lanePoint(gate.kind, gate.open, gate.axis));
    const poll = <T>(query: () => Promise<T>) => expect.poll(query, {
      intervals: [20, 40, 50], timeout: mode === 'sightseeing' ? 16_000 : 8_000,
    });
    let passed = initial;
    for (const gate of sim.mainGates.filter(gate => gate.beat > 100 && gate.worldStation <= lead.worldStation)) {
      await gateAim(gate);
      await poll(async () => (await snap()).gatesPassed).toBe(++passed);
    }
    if (boost) await page.keyboard.down('Shift');
    await poll(async () => (await state()).metrics.routeHologram?.left).toBe(ROUTE_LABELS[branchLayout(seed).left]);
    const recognition = await state();
    expect(recognition.branch?.side).toBeNull();
    expect(recognition.metrics.routeTraces).toMatchObject({ visible: true, phase: 'choice', layout: branchLayout(seed) });
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
    expect(committed.metrics.routeTraces).toMatchObject({ visible: true, phase: 'branch', selected: side === 'left' ? 0 : side === 'right' ? 2 : 1 });
    expect(committed.trackDistance + 1e-8).toBeGreaterThanOrEqual(junction.split);
    expect(committed.time - recognition.time).toBeGreaterThan(1.5);
    for (const [index, gate] of routeGates.entries()) {
      await gateAim(gate);
      await poll(async () => (await snap()).gatesPassed).toBe(++passed);
      if (!index) await page.locator('canvas').screenshot({ path: info.outputPath('orbit-branch.png') });
    }
    if (route === 'score') {
      await aim(0, 0);
      await poll(async () => (await state()).pickup?.status).toBe('collected');
    }
    if (boost) await page.keyboard.up('Shift');
    await gateAim(exit);
    await poll(async () => (await state()).lastGate?.beat).toBe(exit.beat);
    await poll(async () => (await snap()).gatesPassed).toBe(++passed);
    expect(await snap()).toMatchObject({ phase: 'playing', lives: mode === 'sightseeing' ? 5 : difficulty === 'impossible' ? 1 : 2, gatesPassed: passed });
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

test('@perf ORBIT aperture gates share cached geometry and one glass program in real streamed flight', async ({ page }, run) => {
  await page.goto('http://127.0.0.1:8090/?stability');
  await page.waitForFunction(() => !!window.stability);
  const samples = [];
  const station = new Simulation(volumeById('orbit')).reference.station(192, 'standard');
  for (const quality of ['low', 'auto', 'high'] as const) {
    const sample = await page.evaluate(({ quality, station }) => window.stability.fixedGlass(192, quality, true, 'standard', 'center', 180, false,
      { volumeId: 'orbit', fly: true, station }), { quality, station });
    expect(sample.glError).toBe(0);
    expect(sample.metrics.chunks).toBe(0);
    expect(sample.gateKinds.every(kind => kind.startsWith('orbit-'))).toBe(true);
    expect(sample.metrics.gateGeometryCache).toBeLessThanOrEqual(24);
    expect(sample.metrics.textures).toBeLessThanOrEqual(6);
    samples.push({ quality, ...sample });
  }
  await run.attach('Aperture GPU and CPU frame measurements', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
});
