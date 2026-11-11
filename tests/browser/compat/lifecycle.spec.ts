import { expect, test } from '@playwright/test';
import { readMetrics } from '../diagnostics';
import { ready, record, resumeRun, startButton, startRun } from './support';

test('visibility and BFCache suspension preserve progress and obey audio recovery', async ({ page }, info) => {
  await page.addInitScript(() => {
    const callbacks = new Set<number>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = request(now => {
        callbacks.delete(id);
        document.documentElement.dataset.frameCount = String(callbacks.size);
        callback(now);
      });
      callbacks.add(id);
      document.documentElement.dataset.frameCount = String(callbacks.size);
      return id;
    };
    window.cancelAnimationFrame = id => {
      callbacks.delete(id);
      document.documentElement.dataset.frameCount = String(callbacks.size);
      cancel(id);
    };
  });
  if (!await ready(page, info)) return;
  await startRun(page, info);
  await expect.poll(async () => {
    const { phase, beat } = await readMetrics(page);
    return phase === 'playing' && beat > 0.3;
  }).toBe(true);
  const pause = page.getByRole('dialog', { name: 'PAUSED' });
  for (const [hide, show] of [
    ["Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'))",
      "Reflect.deleteProperty(document, 'hidden'); document.dispatchEvent(new Event('visibilitychange'))"],
    ["window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))",
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))"],
  ]) {
    await page.evaluate(hide);
    await expect(pause).toBeVisible();
    const canvas = await page.locator('#gl').elementHandle();
    const before = (await readMetrics(page)).beat;
    await expect(page.locator('html')).toHaveAttribute('data-frame-count', '0');
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
    expect((await readMetrics(page)).beat).toBe(before);
    await page.evaluate(show);
    await expect.poll(async () => !(await pause.isVisible()) ||
      await pause.getByText(/Audio could not start|Rendering fell behind/).isVisible()).toBe(true);
    await resumeRun(page, info);
    await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(before);
    expect((await readMetrics(page)).beat - before).toBeLessThan(1.2);
    expect(await canvas!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-frame-count', '1');
  }
  await page.keyboard.press('p');
  await expect(pause).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.dataset.cachedRun = 'original';
    window.addEventListener('pageshow', event => {
      if (event.persisted) document.documentElement.dataset.cachedRun = 'restored';
    });
  });
  await page.goto('/tools/render-audio.html');
  await page.goBack({ waitUntil: 'commit', timeout: 8_000 });
  if (await page.locator('html').getAttribute('data-cached-run') === 'restored') {
    await expect(pause).toBeVisible();
    await pause.getByRole('button', { name: 'RESUME', exact: true }).click();
    await expect(pause).toBeHidden();
    record(info, 'PASS', 'Real cross-document BFCache navigation retained user pause');
  } else {
    await expect(startButton(page)).toBeEnabled();
    record(info, 'BLOCKED', 'Browser did not store this WebGL/audio page in BFCache on native history navigation');
  }
  record(info, 'PASS', 'Controlled visibility and BFCache events stop and restore one RAF with bounded beat progress');
});

test('WebGL context loss stops rendering and resumes the same run', async ({ page }, info) => {
  const warnings: string[] = [];
  page.on('console', message => { if (/WebGL|Framebuffer/i.test(message.text())) warnings.push(message.text()); });
  await page.addInitScript(() => {
    if (typeof WebGL2RenderingContext === 'undefined') return;
    const gl = WebGL2RenderingContext.prototype;
    let count = 0;
    window.addEventListener('compat-read-draw-calls', () => {
      document.documentElement.dataset.drawCalls = String(count);
    });
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
      const draw = gl[name];
      Object.defineProperty(gl, name, {
        value(this: WebGL2RenderingContext, ...args: unknown[]) {
          count++;
          Reflect.apply(draw, this, args);
        },
      });
    }
  });
  if (!await ready(page, info)) return;
  await startRun(page, info);
  await expect.poll(async () => {
    const { phase, beat } = await readMetrics(page);
    return phase === 'playing' && beat > 0.2;
  }).toBe(true);
  const canvas = await page.locator('#gl').elementHandle();
  const lost = await canvas!.evaluate((el: HTMLCanvasElement) => {
    const gl = el.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    el.addEventListener('webglcontextrestored', () => { el.dataset.restored = 'true'; }, { once: true });
    el.addEventListener('compat-restore', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  });
  if (!lost) {
    record(info, 'BLOCKED', 'WEBGL_lose_context is unavailable; separate failure injection verified fallback');
    return;
  }
  const dialog = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(dialog).toContainText('Waiting for WebGL');
  const countDraws = () => page.evaluate(() => {
    window.dispatchEvent(new Event('compat-read-draw-calls'));
    return Number(document.documentElement.dataset.drawCalls);
  });
  const drawCalls = await countDraws();
  expect(drawCalls).toBeGreaterThan(0);
  const suspended = (await readMetrics(page)).beat;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
  expect((await readMetrics(page)).beat).toBe(suspended);
  expect(await countDraws()).toBe(drawCalls);
  await canvas!.evaluate(el => el.dispatchEvent(new Event('compat-restore')));
  await expect(page.locator('#gl')).toHaveAttribute('data-restored', 'true');
  await expect.poll(async () => !(await dialog.isVisible()) ||
    await dialog.getByText(/Audio could not start|Rendering fell behind/).isVisible()).toBe(true);
  await resumeRun(page, info);
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(suspended);
  expect(await countDraws()).toBeGreaterThan(drawCalls);
  expect(await canvas!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);
  expect(await canvas!.evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError()), warnings.join('\n')).toBe(0);
  record(info, 'PASS', 'Native WebGL loss and recovery preserved the same canvas and run');
});

test('audio suspension and restart preserve progress with one scheduler', async ({ page }, info) => {
  await page.addInitScript(() => {
    const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    let active: AudioContext | undefined;
    let master: GainNode | undefined;
    const buses = new Set<AudioNode>();
    const proto = AudioNode.prototype;
    const connect = proto.connect;
    const disconnect = proto.disconnect;
    function countBuses() { document.documentElement.dataset.audioBuses = String(buses.size); }
    Object.defineProperty(proto, 'connect', {
      value(this: AudioNode, target: AudioNode | AudioParam, ...args: unknown[]) {
        const output = Reflect.apply(connect, this, [target, ...args]);
        if (target === master) { buses.add(this); countBuses(); }
        return output;
      },
    });
    Object.defineProperty(proto, 'disconnect', {
      value(this: AudioNode, ...args: unknown[]) {
        Reflect.apply(disconnect, this, args);
        if ((!args.length || args[0] === master) && buses.delete(this)) countBuses();
      },
    });
    const intervals = new Set<number>();
    const schedule = window.setInterval.bind(window);
    const clear = window.clearInterval.bind(window);
    Object.defineProperty(window, 'setInterval', {
      value(handler: TimerHandler, ms?: number, ...args: unknown[]) {
        const id = Reflect.apply(schedule, window, [handler, ms, ...args]) as number;
        if (ms === 25) intervals.add(id);
        document.documentElement.dataset.audioTimers = String(intervals.size);
        return id;
      },
    });
    Object.defineProperty(window, 'clearInterval', {
      value(id?: number) {
        if (id !== undefined) intervals.delete(id);
        document.documentElement.dataset.audioTimers = String(intervals.size);
        clear(id);
      },
    });
    Object.defineProperty(window, 'AudioContext', { value: class extends Context {
      constructor(options?: AudioContextOptions) {
        super(options);
        active = this;
      }
      override createGain() {
        const node = super.createGain();
        master ??= node;
        return node;
      }
    } });
    window.addEventListener('compat-suspend-audio', () => { void active?.suspend(); });
  });
  if (!await ready(page, info)) return;
  await startRun(page, info);
  const root = page.locator('html');
  if (await root.getAttribute('data-audio-timers') !== '1') {
    expect(await page.evaluate(() => typeof AudioContext === 'function')).toBe(false);
    record(info, 'BLOCKED', 'Audible scheduling unavailable in this environment');
    return;
  }
  await expect(root).toHaveAttribute('data-audio-buses', '1');
  await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(0.4);
  await page.evaluate(() => window.dispatchEvent(new Event('compat-suspend-audio')));
  const dialog = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(dialog).toContainText('Audio could not start');
  await expect(root).toHaveAttribute('data-audio-timers', '0');
  await expect(root).toHaveAttribute('data-audio-buses', '0');
  const before = (await readMetrics(page)).beat;
  await dialog.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(root).toHaveAttribute('data-audio-timers', '1');
  await expect(root).toHaveAttribute('data-audio-buses', '1');
  await expect.poll(async () => (await readMetrics(page)).beat).toBeGreaterThan(before);
  await page.keyboard.press('m');
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.muted'))).toBe('true');
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-audio-timers', '0');
  await expect(root).toHaveAttribute('data-audio-buses', '0');
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(page.locator('#vol-name')).toContainText('DRIFT');
  await expect(startButton(page)).toBeEnabled();
  await expect(root).toHaveAttribute('data-audio-timers', '0');
  await startRun(page, info);
  await expect(root).toHaveAttribute('data-audio-timers', '1');
  await expect(root).toHaveAttribute('data-audio-buses', '1');
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-audio-timers', '0');
  await expect(root).toHaveAttribute('data-audio-buses', '0');
  record(info, 'PASS', 'Native audio suspend/resume, mute, switch and stop with one scheduler and a disconnected run bus');
});
