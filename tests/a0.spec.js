import { test, expect } from '@playwright/test';

const volumes = [
  ['elsewhere', 128, [0, 16, 96, 160, 192, 288, 320, 384, 448], [143, 144, 144]],
  ['drift', 96, [0, 16, 80, 128, 160, 208, 224], [40, 40, 40]],
  ['descent', 110, [0, 16, 112, 208, 240, 336, 400], [158, 158, 158]],
  ['orbit', 100, [0, 16, 96, 176, 256, 320], [91, 91, 91]],
];

// Attach readouts to the real module without adding a public game control API.
async function instrument(page, { manual = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' || /WebGL: (INVALID_|OUT_OF_MEMORY)/.test(message.text())) {
      errors.push(message.text());
    }
  });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  await page.route('**/js/main.js*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    if (manual) {
      body = body.replace(/requestAnimationFrame\(loop\);\r?\n\}/, '}');
    }
    body = body.replace('function render(now) {',
      'function render(now) { renderer.info.autoReset = false; renderer.info.reset();');
    await route.fulfill({ response, body: body + `
window.audit = {
  G, CAM, audio, gates, path, tunnel, post, renderer, camera, startGame, step, render, loop,
  sample() {
    const gl = renderer.getContext();
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      state: G.state, beat: G.beat, distance: G.distance,
      pr: renderer.getPixelRatio(), canvas: [canvas.width, canvas.height],
      targets: [post.rtScene, post.rtDof, post.rtDepth, post.rtA, post.rtB]
        .map(rt => [rt.width, rt.height, rt.samples]),
      chunks: tunnel.chunks.length, instances: tunnel.chunks.flatMap(c => c.meshes)
        .filter(m => m.isInstancedMesh).length,
      memory: { ...renderer.info.memory }, programs: renderer.info.programs.length,
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      glError: gl.getError(),
      gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webgl: gl.getParameter(gl.VERSION),
      heap: performance.memory?.usedJSHeapSize,
    };
  },
};` });
  });
  return errors;
}

async function boot(page, query) {
  await page.goto('/?' + query);
  await expect.poll(() => page.evaluate(() => !!window.audit)).toBe(true);
}

for (const [id, bpm, boundaries, counts] of volumes) {
  test(`${id} chart and live simulation across all difficulties`, async ({ page }) => {
    const errors = await instrument(page);
    for (const [index, diff] of ['easy', 'normal', 'hard'].entries()) {
      // Fixed clock uses ordinary spawn, steering, collision, scoring and settlement.
      const beats = boundaries.at(-1);
      await boot(page, `vol=${id}&diff=${diff}&q=low&t=${beats * 60 / bpm + 0.8}&align=1&god=0`);
      const run = await page.evaluate(async () => {
        const { G, path } = audit;
        const { chartFor, DIFFICULTY, SECTIONS, BPM, SONG_BEATS } = await import('/js/chart.js?v=2026-11-10za');
        const diff = new URLSearchParams(location.search).get('diff');
        const chart = chartFor(diff, DIFFICULTY[diff].seed);
        let beat = 0;
        const windows = SECTIONS.map(section => {
          const start = beat;
          beat += section.beats;
          return { name: section.name, start, end: beat };
        });
        return {
          BPM, SONG_BEATS, windows, chart,
          stable: JSON.stringify(chart) === JSON.stringify(G.chart),
          state: G.state, passed: G.gatesPassed, judged: G.gatesJudged, hits: G.hits,
          combo: G.maxCombo, lives: G.lives, expectedLives: DIFFICULTY[diff].lives,
          distance: G.distance, pathLength: path.length,
          stats: ['title', 'gates', 'combo', 'acc', 'rank'].map(k =>
            document.getElementById('over-' + k).textContent),
        };
      });
      expect(run.BPM).toBe(bpm);
      expect(run.SONG_BEATS).toBe(beats);
      expect([...run.windows.map(w => w.start), beats]).toEqual(boundaries);
      expect(run.chart[0].beat).toBe(boundaries[1]);
      expect(run.chart.filter(g => !run.windows.some(w =>
        g.beat >= w.start && g.beat < w.end && g.section === w.name))).toEqual([]);
      expect(run.chart.length).toBe(counts[index]);
      const gaps = run.chart.slice(1).map((g, i) => g.beat - run.chart[i].beat);
      expect(Math.min(...gaps)).toBeCloseTo(id === 'elsewhere' ? (diff === 'easy' ? 2 : 1)
        : id === 'drift' ? 3 : id === 'descent' ? 2 : 2.5);
      expect(run.stable).toBe(true);
      expect(run.state).toBe('over');
      expect(run.passed).toBe(run.chart.length);
      expect(run.judged).toBe(run.passed);
      expect(run.hits).toBe(0);
      expect(run.lives).toBe(run.expectedLives);
      expect(run.distance).toBeLessThan(run.pathLength - 420);
      expect(run.stats).toEqual(['ESCAPED', `${run.passed}/${run.passed}`, String(run.passed), '100%', 'S']);
      expect(await page.evaluate(() => audit.sample().glError)).toBe(0);
    }
    expect(errors).toEqual([]);
  });

  test(`${id} shader samples agree with point collision`, async ({ page }) => {
    await instrument(page, { manual: true });
    await boot(page, `vol=${id}&q=low`);
    const mismatches = await page.evaluate(async () => {
      const THREE = await import('three');
      const { Gate, laneOf, lanePoint } = await import('/js/gates.js?v=2026-11-10za');
      const { VOL } = await import('/js/volumes.js');
      const r = audit.renderer;
      const rt = new THREE.WebGLRenderTarget(3, 3);
      const scene = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(-0.001, 0.001, 0.001, -0.001, 0.1, 30);
      const pixel = new Uint8Array(4);
      const result = [];
      for (const axis of [0, 1]) {
        for (const open of Array.from({ length: 9 }, (_, i) => i)) {
          const g = new Gate(open, axis, 0);
          scene.add(g.meshes[0]);
          const [cx, cy] = lanePoint(g.open, axis);
          const points = [[0, 0], [cx, cy], [1, 0], [1.05, 0],
            [0.95, 0], [1.25, 0], [1.27, 0], [-1.27, 0], [0, 1],
            [0, -1], [0, 2], [0, -2], [cx + 0.94, cy], [cx + 0.96, cy]];
          for (const [x, y] of points) {
            if (Math.abs(x) > 3.4 || Math.abs(y) > 2.6 || Math.abs(x) + Math.abs(y) > 4.85) continue;
            cam.position.set(x, y, 3);
            r.setRenderTarget(rt);
            r.render(scene, cam);
            r.readRenderTargetPixels(rt, 1, 1, 1, 1, pixel);
            const visible = pixel[0] + pixel[1] + pixel[2] > 0;
            const pass = g.canPass ? g.canPass(x, y) : laneOf(x, y, axis) === g.open;
            if (pass === visible) result.push({ style: VOL.obstacle, axis, open: g.open, x, y, visible, pass });
          }
          scene.remove(g.meshes[0]);
          g.dispose();
        }
      }
      r.setRenderTarget(null);
      rt.dispose();
      return result;
    });
    expect(mismatches).toEqual([]);
  });

  test(`${id} offline synthesis has signal in every section`, async ({ page }) => {
    await page.goto(`/tools/render-audio.html?vol=${id}`);
    const signal = await page.evaluate(async () => {
      const { AudioEngine } = await import('/js/audio.js');
      const { VOL } = await import('/js/volumes.js');
      const sampleRate = 16_000, lead = 0.12;
      const beatSeconds = 60 / VOL.bpm;
      const levels = [];
      let sectionBeat = 0;
      for (const section of VOL.sections) {
        const duration = 8 * beatSeconds;
        const ctx = new OfflineAudioContext(2, Math.ceil((lead + duration) * sampleRate), sampleRate);
        const audio = new AudioEngine(VOL.bpm, () => ctx);
        audio.setVolume(1);
        await audio.init();
        for (let offset = 0; offset < 32; offset++) {
          const step = sectionBeat * 4 + offset;
          audio.step = step;
          audio._playStep(step % 16, Math.floor(step / 16) % 8, lead + offset * beatSeconds / 4);
        }
        const buffer = await ctx.startRendering();
        let squares = 0, peak = 0, n = 0;
        for (let ch = 0; ch < 2; ch++) {
          const samples = buffer.getChannelData(ch);
          for (let i = Math.floor(lead * sampleRate); i < samples.length; i++) {
            const v = samples[i];
            squares += v * v;
            peak = Math.max(peak, Math.abs(v));
            n++;
          }
        }
        levels.push({ section: section.name, rms: Math.sqrt(squares / n), peak });
        sectionBeat += section.beats;
      }
      return levels;
    });
    console.log(id, JSON.stringify(signal.map(({ rms, peak }) => [rms.toFixed(4), peak.toFixed(4)])));
    for (const { section, rms, peak } of signal) {
      expect(rms, section).toBeGreaterThan(0.001);
      expect(peak, section).toBeLessThanOrEqual(1);
    }
  });
}

test('desktop input, settings, loss, retry and menu', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = await instrument(page);
  await boot(page, 'q=low&dbg=1');
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#set-volume').fill('37');
  await page.keyboard.press('Space');
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('[data-q=high]').click();
  await expect(page).toHaveURL(/q=high/);
  await expect.poll(() => page.evaluate(() => !!window.audit)).toBe(true);
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#set-volume')).toHaveValue('37');
  await page.locator('[data-q=low]').click();
  await expect(page).toHaveURL(/q=low/);
  await expect.poll(() => page.evaluate(() => !!window.audit)).toBe(true);
  await page.locator('[data-diff=hard]').click();
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => page.evaluate(() => audit.audio.running)).toBe(true);
  expect(await page.evaluate(() => audit.audio.master.gain.value)).toBeCloseTo(0.37);
  for (const key of ['d', 'ArrowUp']) {
    const axis = key === 'd' ? 'tx' : 'ty';
    const before = await page.evaluate(axis => audit.CAM[axis], axis);
    await page.keyboard.down(key);
    await expect.poll(() => page.evaluate(axis => audit.CAM[axis], axis)).toBeGreaterThan(before + 0.12);
    await page.keyboard.up(key);
  }
  await page.mouse.move(50, 50);
  await expect.poll(() => page.evaluate(() => audit.CAM.tx)).toBeLessThan(-1);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.up();
  await expect(page.locator('#hud-boost')).toHaveClass(/on/);
  await expect.poll(() => page.evaluate(() => audit.G.speed)).toBeGreaterThan(24.7);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#hud-boost')).not.toHaveClass(/on/);
  await page.keyboard.up('Shift');
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => audit.audio.master.gain.value)).toBeLessThan(0.01);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => audit.audio.master.gain.value)).toBeCloseTo(0.37);
  await page.mouse.move(480, 270);
  await expect(page.locator('#over-title')).toHaveText('TERMINATED', { timeout: 20_000 });
  await expect(page.locator('#over-acc')).toHaveText('0%');
  await expect(page.locator('#over')).toBeVisible();
  await page.locator('[data-act=restart]').click();
  await expect(page.locator('#hud-gates')).toHaveText(/^0\//);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  expect(await page.evaluate(() => audit.audio.running)).toBe(false);
  expect(errors).toEqual([]);
});

test('mobile touch steering and cancellation preserve cruise', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:8088',
    viewport: { width: 393, height: 720 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    const errors = await instrument(page);
    await boot(page, 'vol=drift&q=auto');
    await page.locator('[data-diff=easy]').tap();
    await page.locator('[data-act=start]').tap();
    await expect(page.locator('#hud-lives .on')).toHaveCount(4);
    const cdp = await context.newCDPSession(page);
    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await send('touchStart', [{ x: 180, y: 300 }]);
    await send('touchMove', [{ x: 255, y: 255 }]);
    await expect.poll(() => page.evaluate(() => audit.CAM.tx)).toBeGreaterThan(1);
    await expect(page.locator('#hud-boost')).not.toHaveClass(/on/);
    await send('touchCancel', []);
    await send('touchStart', [{ x: 180, y: 300 }]);
    await send('touchMove', [{ x: 110, y: 300 }]);
    await send('touchEnd', []);
    await expect.poll(() => page.evaluate(() => audit.CAM.tx)).toBeLessThan(0.4);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test('runtime resolution drop also resizes post targets and survives resize', async ({ page }) => {
  await instrument(page, { manual: true });
  await page.setViewportSize({ width: 320, height: 180 });
  await page.addInitScript(() => Object.defineProperty(window, 'devicePixelRatio', { value: 2 }));
  await boot(page, 'q=high');
  const original = await page.evaluate(() => audit.sample());
  expect(original.targets[0]).toEqual([512, 288, 4]);
  // Feed slow frames to the ordinary loop independently of the host refresh rate.
  await page.evaluate(() => {
    const start = performance.now();
    for (let i = 1; i <= 185; i++) audit.loop(start + i * 40);
  });
  let sample = await page.evaluate(() => audit.sample());
  expect(sample.pr).toBe(1);
  expect(sample.targets[0].slice(0, 2)).toEqual(sample.canvas);
  await page.setViewportSize({ width: 400, height: 220 });
  await expect.poll(() => page.evaluate(() => audit.sample().canvas)).toEqual([400, 220]);
  sample = await page.evaluate(() => audit.sample());
  expect(sample.canvas).toEqual([400, 220]);
  expect(sample.targets).toEqual([[400, 220, 4], [400, 220, 0], [200, 110, 0], [100, 55, 0], [100, 55, 0]]);
  expect(sample.glError).toBe(0);
});

test('beat jumps judge each gate once, with beat-based invulnerability and accuracy', async ({ page }) => {
  await instrument(page, { manual: true });
  await boot(page, 'q=low');
  const result = await page.evaluate(async () => {
    await audit.startGame(false);
    const { G, CAM, audio, gates, step } = audit;
    let beat = 0;
    Object.defineProperty(audio, 'beat', { get: () => beat });
    audio.running = true;
    G.chart = [16, 17, 18, 20].map(beat => ({ beat, sector: 0 }));
    G.gatesTotal = G.chart.length;
    const advance = (to, x) => {
      beat = to;
      CAM.x = CAM.tx = x;
      step(0.016);
    };
    advance(15, 2.15);
    const early = [G.gatesJudged, gates.list[0].d];
    advance(16, 2.15);
    const onBeat = [G.gatesPassed, gates.list[0].d];
    advance(19, 0); // crosses two solid panes during a single rendered frame
    const afterGap = [G.gatesJudged, G.hits, G.lives, G.combo];
    advance(20, 2.15);
    advance(20.25, 0);
    advance(448, 0);
    step(0.8);
    return { early, onBeat, afterGap, judged: G.gatesJudged,
      beat: G.beat, accuracy: document.querySelector('#over-acc').textContent };
  });
  expect(result.early[0]).toBe(0);
  expect(result.early[1]).toBeGreaterThan(0);
  expect(result.onBeat).toEqual([1, 0]);
  expect(result.afterGap).toEqual([3, 1, 1, 0]);
  expect(result.judged).toBe(4);
  expect(result.beat).toBe(448);
  expect(result.accuracy).toBe('50%');
});

test('the shortest ELSEWHERE keyboard transition and crash exit are playable', async ({ page }) => {
  await instrument(page, { manual: true });
  await boot(page, 'q=low');
  const result = await page.evaluate(async () => {
    const { G, CAM, startGame, step } = audit;
    const key = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key }));
    await startGame(false);
    G.chart = G.chart.filter(g => g.beat === 383 || g.beat === 384 || g.beat === 386.33);
    G.beat = 383 - 1 / 128;
    CAM.x = CAM.tx = 2.15;
    step(1 / 60);
    key('keydown', 'a');
    key('keydown', 'w');
    for (let i = 0; i < 21; i++) step(1 / 60);
    key('keyup', 'a');
    key('keyup', 'w');
    for (let i = 0; i < 8; i++) step(1 / 60);
    const passed = G.gatesPassed;
    G.lives = 1;
    CAM.x = CAM.y = CAM.tx = CAM.ty = 0;
    step(2);
    const crash = G.state;
    key('keydown', 'Escape');
    await startGame(false);
    step(1);
    return { passed, crash, state: G.state, retryJudged: G.gatesJudged };
  });
  expect(result).toEqual({ passed: 2, crash: 'crash', state: 'play', retryJudged: 0 });
});

test('audio scheduler keeps its sixteenth grid and drops stale starts', async ({ page }) => {
  await page.goto('/tools/render-audio.html');
  const result = await page.evaluate(async () => {
    const { AudioEngine } = await import('/js/audio.js');
    const events = [];
    const scheduler = new AudioEngine(128);
    scheduler.ctx = { currentTime: 11.3, state: 'running' };
    scheduler.running = scheduler.ok = true;
    scheduler.t0 = 10;
    scheduler.nextTime = 10;
    scheduler._playStep = (step, bar, time) => events.push({ step, bar, time });
    scheduler._schedule();
    const ctx = new OfflineAudioContext(2, 16000, 16000);
    const engine = new AudioEngine(128, () => ctx);
    await engine.init();
    let unblock;
    ctx.resume = () => new Promise(resolve => { unblock = resolve; });
    const pending = engine.start();
    await Promise.resolve();
    engine.stop();
    Object.defineProperty(ctx, 'state', { value: 'running' });
    unblock();
    const started = await pending;
    const running = engine.running, timer = !!engine.timer;
    engine.stop();
    return { events, started, running, timer };
  });
  expect(result.events).toEqual([{ step: 12, bar: 0, time: 11.40625 }]);
  expect(result).toMatchObject({ started: false, running: false, timer: false });
});

test('visibility changes pause and resume the real transport without beat drift', async ({ page }) => {
  await instrument(page);
  await boot(page, 'q=low');
  await page.locator('[data-act=start]').click();
  await expect.poll(() => page.evaluate(() => audit.G.beat)).toBeGreaterThan(0.2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => audit.audio.ctx.state)).toBe('suspended');
  const pause = await page.evaluate(async () => {
    const { G, audio } = audit;
    const before = [G.beat, audio.beat];
    await new Promise(resolve => setTimeout(resolve, 250));
    const after = [G.beat, audio.beat];
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
    return { before, after };
  });
  expect(pause.after).toEqual(pause.before);
  await expect.poll(() => page.evaluate(() => audit.G.beat)).toBeGreaterThan(pause.before[0] + 0.2);
  const drift = await page.evaluate(() => Math.abs(audit.G.beat - audit.audio.beat));
  expect(drift).toBeLessThan(0.1);
});

test('offline stop cuts both dry notes and reverb before a new run', async ({ page }) => {
  await page.goto('/tools/render-audio.html');
  const levels = await page.evaluate(async () => {
    const { AudioEngine } = await import('/js/audio.js');
    const rate = 16000;
    const ctx = new OfflineAudioContext(2, 3 * rate, rate);
    const audio = new AudioEngine(128, () => ctx);
    await audio.init();
    audio._pad(0.05, [57, 60, 64], 2);
    audio._pluck(0.45, 80, 0.2, 1);
    const suspend = ctx.suspend(0.5);
    const rendering = ctx.startRendering();
    await suspend;
    audio.stop();
    audio._connectRun?.();
    audio._kick(1.5, 0.8);
    await ctx.resume();
    const channel = (await rendering).getChannelData(0);
    const max = (a, b) => Math.max(...channel.slice(a * rate, b * rate).map(Math.abs));
    return [max(0.3, 0.49), max(0.6, 1.49), max(1.5, 1.9)];
  });
  expect(levels[0]).toBeGreaterThan(0.01);
  expect(levels[1]).toBeLessThan(0.0001);
  expect(levels[2]).toBeGreaterThan(0.01);
});

test('fixed ORBIT capture is repeatable and boosted DESCENT stays on the path', async ({ page }) => {
  await instrument(page);
  let previous;
  for (let i = 0; i < 2; i++) {
    await boot(page, 'vol=orbit&diff=hard&t=110.125&q=low&align=1&god=0');
    const snapshot = await page.evaluate(() => {
      const { G, CAM, gates } = audit;
      return {
        beat: G.beat, distance: G.distance, score: G.score, cam: { ...CAM },
        gates: gates.list.map(g => [g.open, g.axis, g.d]),
      };
    });
    expect(snapshot.beat).toBeCloseTo(110.125 * 100 / 60, 8);
    if (previous) expect(snapshot).toEqual(previous);
    previous = snapshot;
  }
  await boot(page, 'vol=descent&diff=hard&t=219&q=low&align=1&god=0&boost=1');
  const run = await page.evaluate(() => ({
    ...audit.sample(), passed: audit.G.gatesPassed, length: audit.path.length,
  }));
  expect(run.state).toBe('over');
  expect(run.passed).toBe(158);
  expect(run.distance).toBeGreaterThan(4200 + 7200);
  expect(run.distance + 420).toBeLessThan(run.length);
  const frames = await page.evaluate(() => {
    const { path } = audit;
    const at = path.segments[5].s1;
    const a = path.sample(at - 0.01);
    const b = path.sample(at + 0.01);
    return [a.p.distanceTo(b.p), a.f.dot(b.f), a.r.dot(a.u), a.f.dot(a.u), a.r.length()];
  });
  expect(frames[0]).toBeCloseTo(0.02, 5);
  expect(frames[1]).toBeCloseTo(1, 6);
  expect(frames[2]).toBeCloseTo(0, 6);
  expect(frames[3]).toBeCloseTo(0, 6);
  expect(frames[4]).toBeCloseTo(1, 6);
});

test('streaming releases instance buffers and reload cycles stay bounded', async ({ page }) => {
  const errors = await instrument(page, { manual: true });
  await boot(page, 'q=low');
  const trace = await page.evaluate(async () => {
    const { tunnel, G, startGame, step, render } = audit;
    const samples = [];
    await startGame(false);
    step(0);
    const old = tunnel.chunks.flatMap(c => c.meshes).find(m => m.isInstancedMesh);
    let disposed = false, sharedDisposed = false;
    old.addEventListener('dispose', () => { disposed = true; });
    old.geometry.addEventListener('dispose', () => { sharedDisposed = true; });
    for (const distance of [4200, 4800, 5400, 6000, 6600, 7200, 4200]) {
      G.distance = distance;
      step(0);
      render(performance.now());
      samples.push(audit.sample());
    }
    return { disposed, sharedDisposed, samples };
  });
  expect(trace.disposed).toBe(true);
  expect(trace.sharedDisposed).toBe(false);
  expect(trace.samples.every(s => s.chunks <= 5 && s.glError === 0)).toBe(true);
  expect(trace.samples.at(-1).memory.geometries).toBeLessThanOrEqual(trace.samples[0].memory.geometries + 5);
  expect(errors).toEqual([]);
  console.log(JSON.stringify(trace.samples.map(s => [s.distance, s.chunks, s.instances, s.memory.geometries, s.memory.textures])));
});

test('WebGL context restores, and pagehide releases page-owned resources', async ({ page }) => {
  await instrument(page);
  await boot(page, 'vol=orbit&q=low');
  const lost = await page.evaluate(async () => {
    const canvas = audit.renderer.domElement;
    const gl = audit.renderer.getContext();
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('BLOCKED: WEBGL_lose_context unavailable');
    const event = new Promise(resolve => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    window.restore = () => extension.restoreContext();
    extension.loseContext();
    await event;
    return gl.isContextLost();
  });
  expect(lost).toBe(true);
  await page.evaluate(async () => {
    const canvas = audit.renderer.domElement;
    const event = new Promise(resolve => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    restore();
    await event;
  });
  await expect.poll(() => page.evaluate(() => audit.sample().calls)).toBeGreaterThan(1);
  expect(await page.evaluate(() => audit.sample().glError)).toBe(0);
  const released = await page.evaluate(() => {
    const { post, tunnel } = audit;
    let targets = 0;
    for (const rt of [post.rtScene, post.rtDof, post.rtDepth, post.rtA, post.rtB]) {
      rt.addEventListener('dispose', () => targets++);
    }
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    return [targets, tunnel.chunks.length, document.querySelector('#rec') === null];
  });
  expect(released).toEqual([5, 0, true]);
});

test('@perf comparable frame, resource and restart samples', async ({ browser }) => {
  const profiles = [
    ...volumes.map(([vol]) => [vol, 'low', 960, 540, 1, false]),
    ['elsewhere', 'high', 960, 540, 2, false],
    ['drift', 'auto', 393, 720, 2, true],
  ];
  for (const [vol, q, width, height, dpr, mobile] of profiles) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:8088', viewport: { width, height },
      deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
      const errors = await instrument(page);
      const initBegin = performance.now();
      await boot(page, `vol=${vol}&q=${q}`);
      const readyMs = performance.now() - initBegin;
      await page.locator('[data-act=start]').click();
      const result = await page.evaluate(async () => {
        const frames = [];
        await new Promise(resolve => {
          let start, last;
          function frame(now) {
            start ??= now;
            if (now - start >= 2500 && last !== undefined) frames.push(now - last);
            last = now;
            if (now - start < 6500) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        const play = audit.sample();
        const percentile = p => frames[Math.floor((frames.length - 1) * p)];
        frames.sort((a, b) => a - b);
        return {
          frames: frames.length, fps: 1000 * frames.length / frames.reduce((a, b) => a + b, 0),
          ms: [percentile(0.5), percentile(0.95), percentile(1)], play,
        };
      });
      await page.keyboard.press('Escape');
      const menu = await page.evaluate(() => audit.sample());
      await page.locator('[data-act=start]').click();
      const restart = await page.evaluate(() => audit.sample());
      await page.keyboard.press('Escape');
      const switchBegin = performance.now();
      await page.getByRole('button', { name: 'next volume' }).click();
      await page.waitForURL(url => url.searchParams.get('vol') !== vol);
      await expect.poll(() => page.evaluate(() => !!window.audit)).toBe(true);
      const switchReadyMs = performance.now() - switchBegin;
      console.log(JSON.stringify({ browser: browser.version(), vol, q, width, height, dpr, mobile, ...result,
        menu, restart, readyMs, switchReadyMs, errors }));
      expect(result.play.state).toBe('play');
      expect(menu.state).toBe('menu');
      expect(restart.state).toBe('play');
      expect(result.play.glError).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});
