import { expect, test } from '@playwright/test';
import { VOLUMES } from '../../app/game/core/volumes';
import { readMetrics } from './diagnostics';

test('@perf comparable frame, resource and restart samples', async ({ browser }) => {
  const profiles = [
    ...VOLUMES.map(({ id }) => [id, 'low', 960, 540, 1, false] as const),
    ['elsewhere', 'high', 960, 540, 2, false],
    ['drift', 'auto', 393, 720, 2, true],
  ] as const;
  for (const [vol, q, width, height, dpr, mobile] of profiles) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:8089', viewport: { width, height },
      deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
    });
    try {
      const page = await context.newPage();
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
