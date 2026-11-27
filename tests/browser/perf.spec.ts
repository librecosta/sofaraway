import { expect, test } from '@playwright/test';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { VOLUMES, volumeById } from '../../app/game/core/volumes';
import { readMetrics } from './diagnostics';

test('@perf comparable frame, resource and restart samples', async ({ browser }) => {
  const profiles = [
    ...VOLUMES.map(({ id }) => [id, 'low', 960, 540, 1, false] as const),
    ['elsewhere', 'high', 960, 540, 2, false],
    ['daybreak', 'auto', 393, 720, 2, true],
  ] as const;
  for (const [vol, q, width, height, dpr, mobile] of profiles) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:8089', viewport: { width, height },
      deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('sofaraway.immersiveMouse', 'false'));
      if (mobile) await page.addInitScript(() => localStorage.setItem('sofaraway.orientation', 'portrait'));
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const initBegin = performance.now();
      await page.goto(`/?vol=${vol}&q=${q}&dbg=1`);
      const start = page.locator('[data-act=start]');
      await expect(start).toBeEnabled();
      const readyMs = performance.now() - initBegin;
      await page.addStyleTag({ content: '#errbox { display: none; }' });
      await start.click();
      const timing = await page.evaluate(async () => {
        const frames: number[] = [];
        await new Promise<void>(resolve => {
          let start: number | undefined, last: number | undefined;
          function frame(now: number) {
            start ??= now;
            if (now - start >= 2500 && last !== undefined) frames.push(now - last);
            last = now;
            if (now - start < 6500) requestAnimationFrame(frame);
            else resolve();
          }
          requestAnimationFrame(frame);
        });
        const gl = document.querySelector('canvas')!.getContext('webgl2')!;
        const gpu = gl.getExtension('WEBGL_debug_renderer_info');
        const percentile = (p: number) => frames[Math.floor((frames.length - 1) * p)];
        frames.sort((a, b) => a - b);
        return {
          frames: frames.length, fps: 1000 * frames.length / frames.reduce((a, b) => a + b, 0),
          ms: [percentile(0.5), percentile(0.95), percentile(1)],
          glError: gl.getError(), gpu: gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : null,
          webgl: gl.getParameter(gl.VERSION),
          heap: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
        };
      });
      const play = await readMetrics(page);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await readMetrics(page)).phase).toBe('menu');
      const menu = await readMetrics(page);
      await start.click();
      await expect.poll(async () => (await readMetrics(page)).phase).toBe('playing');
      const restart = await readMetrics(page);
      await page.keyboard.press('Escape');
      const switchBegin = performance.now();
      await page.getByRole('button', { name: 'next volume' }).click();
      await page.waitForURL(url => url.searchParams.get('vol') !== vol);
      await expect.poll(async () => (await readMetrics(page)).switchMs).toBeGreaterThan(0);
      const switchReadyMs = performance.now() - switchBegin;
      const switched = await readMetrics(page);
      console.log(JSON.stringify({ browser: browser.version(), vol, q, width, height, dpr, mobile,
        ...timing, play, menu, restart, switched, readyMs, switchReadyMs, errors }));
      expect(play.phase).toBe('playing');
      expect(timing.glError).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
});

test('@perf DESCENT Hard and Impossible keep bounded glass resources across quality tiers', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const samples = (['hard', 'impossible'] as const).map(difficulty => {
    const sim = new Simulation(volumeById('descent'), { align: true });
    sim.start(difficulty);
    const station = sim.reference.station(211, 'standard');
    while (sim.trackDistance < station && sim.phase === 'playing') sim.step(STEP, idleInput);
    return { difficulty, beat: sim.beat };
  });
  for (const quality of ['low', 'auto', 'high'] as const) for (const samplePoint of samples) {
    const { difficulty } = samplePoint;
    const before = await page.evaluate(async ({ quality, difficulty, beat }) => {
      const test = window.b0Harness;
      await test.mount({ volumeId: 'descent', difficulty, quality, diagnostics: {
        fixedTime: null, autoplay: false, god: false, align: true, boost: false,
        mobileQuality: false, post: true, record: false, debug: true,
      } });
      await test.start(true);
      const before = test.advanceAndPause(beat).metrics;
      await test.resume(true);
      return before;
    }, { quality, ...samplePoint });
    await page.keyboard.down('Shift');
    const sample = await page.evaluate(async () => {
      const test = window.b0Harness;
      const frames: number[] = [];
      await new Promise<void>(resolve => {
        let first = 0, last = 0;
        const frame = (now: number) => {
          first ||= now;
          if (last && now - first > 450) frames.push(now - last);
          last = now;
          if (now - first < 2450) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      frames.sort((a, b) => a - b);
      const { metrics } = test.branchState();
      const resources = test.meshResources();
      const gl = document.querySelector('canvas')!.getContext('webgl2')!;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
      const glError = gl.getError();
      const { boosting } = test.snapshot();
      test.dispose();
      return { metrics, resources, renderer, glError, boosting, frames: frames.length,
        p95: frames[Math.floor((frames.length - 1) * .95)],
        fps: 1000 * frames.length / frames.reduce((sum, dt) => sum + dt, 0) };
    });
    await page.keyboard.up('Shift');
    const { metrics: { calls, triangles, geometries, textures, programs, chunks, canvas }, resources } = sample;
    console.log('DESCENT GLASS PERF', { difficulty, quality, canvas, calls, triangles, geometries, textures, programs, chunks,
      ...resources, p95: sample.p95, fps: sample.fps, frames: sample.frames, renderer: sample.renderer });
    expect(sample.glError).toBe(0);
    expect(sample.boosting).toBe(true);
    expect(sample.frames).toBeGreaterThan(0);
    expect(geometries).toBeLessThanOrEqual(before.geometries + 4);
    expect(chunks).toBeLessThanOrEqual(5);
    await expect(page.locator('canvas')).toHaveCount(0);
  }
});
