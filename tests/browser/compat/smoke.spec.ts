import { expect, test } from '@playwright/test';
import { readMetrics } from '../diagnostics';
import { fallback, ready, record, startButton, startRun } from './support';

test('prerender, four volumes, a live run and restart', async ({ browser, page, request, hasTouch }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /WebGL.*(?:INVALID_|INCOMPLETE|OUT_OF_MEMORY)/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  const html = await (await request.get('/?vol=orbit')).text();
  expect(html).toContain('og:title');
  expect(html).toContain('SOFARAWAY');
  expect(html).not.toContain('<canvas');
  const playable = await ready(page, info, '/?q=auto&dbg=1');
  const graphics = await page.evaluate(() => {
    const gl = document.querySelector<HTMLCanvasElement>('#gl')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      viewport: [innerWidth, innerHeight],
      webgl: gl?.getParameter(gl.VERSION),
      renderer: gl?.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      float: !!gl?.getExtension('EXT_color_buffer_float'),
      maxSamples: gl?.getParameter(gl.MAX_SAMPLES),
      maxTexture: gl?.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbuffer: gl?.getParameter(gl.MAX_RENDERBUFFER_SIZE),
    };
  });
  record(info, 'PASS', 'Static prerender and hydration', { version: browser.version(), ...graphics });
  expect(errors).toEqual([]);
  if (!playable) return;
  const canvas = await page.locator('#gl').elementHandle();
  for (const name of ['DRIFT', 'DESCENT', 'ORBIT', 'ELSEWHERE']) {
    await page.getByRole('button', { name: 'next volume' }).click();
    await expect(page.locator('#vol-name')).toContainText(name);
    await expect(startButton(page)).toBeEnabled();
  }
  expect(await canvas!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);
  await expect(page.locator('#errbox')).toHaveText(/"phase":"menu"/);
  const initial = await readMetrics(page);
  expect(initial.calls).toBeGreaterThan(0);
  if (!hasTouch) {
    await page.locator('[data-diff=hard]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-diff=hard]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#hud')).toBeHidden();
    await page.locator('#gl').click({ position: { x: 80, y: 140 } });
  }
  await startRun(page, info, hasTouch ? 'tap' : 'Enter');
  await expect.poll(async () => {
    const { phase, beat } = await readMetrics(page);
    return phase === 'playing' && beat > 0.2;
  }).toBe(true);
  if (!hasTouch) {
    await page.mouse.move(60, 70);
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeLessThan(-0.5);
    await page.keyboard.down('d');
    const left = (await readMetrics(page)).camera.tx;
    await expect.poll(async () => (await readMetrics(page)).camera.tx).toBeGreaterThan(left + 0.2);
    await page.keyboard.up('d');
    const vertical = (await readMetrics(page)).camera.ty;
    await page.keyboard.down('ArrowDown');
    await expect.poll(async () => (await readMetrics(page)).camera.ty).toBeLessThan(vertical - 0.2);
    await page.keyboard.up('ArrowDown');
    await page.mouse.down();
    await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(25);
    await page.keyboard.down('Shift');
    await page.mouse.up();
    await expect.poll(async () => (await readMetrics(page)).speed).toBeGreaterThan(25);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await readMetrics(page)).speed).toBeLessThan(24.5);
  }
  await page.keyboard.press('p');
  const pause = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(pause).toBeVisible();
  await pause.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(pause).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(startButton(page)).toBeEnabled();
  if (!hasTouch) await page.locator('#gl').click({ position: { x: 80, y: 140 } });
  await startRun(page, info, hasTouch ? 'tap' : 'Space');
  await expect(page.locator('#hud-gates')).toHaveText('0/144');
  expect(await canvas!.evaluate((el: HTMLCanvasElement) => el.getContext('webgl2')!.getError())).toBe(0);
  expect(errors).toEqual([]);
  record(info, initial.dof ? 'PASS' : 'DEGRADED', 'Four volumes, live input, pause, resume, exit and restart',
    { canvas: initial.canvas, targets: initial.targets, dof: initial.dof });
});

test('settings keyboard interaction cannot activate the game behind the dialog', async ({ page }, info) => {
  if (!await ready(page, info)) return;
  await page.locator('[data-act=settings]').click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await settings.evaluate(el => el.contains(document.activeElement))).toBe(true);
  const volume = settings.locator('#set-volume');
  await volume.focus();
  const before = Number(await volume.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveValue(String(before + 1));
  await page.keyboard.press('Space');
  await expect(page.locator('#hud')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.locator('[data-act=settings]')).toBeFocused();
  record(info, 'PASS', 'Dialog focus, slider keys, Escape and focus restoration');
});

for (const audio of ['absent', 'rejected', 'pending'] as const) {
  test(`audio activation ${audio} offers a user-controlled silent run`, async ({ page }, info) => {
    await page.addInitScript(audio => {
      const replacement = audio === 'absent' ? undefined : class {
        get state(): AudioContextState { return 'suspended'; }
        resume() {
          return audio === 'pending' ? new Promise<void>(() => {})
            : Promise.reject(new DOMException('Blocked by test', 'NotAllowedError'));
        }
        close() { return Promise.resolve(); }
      };
      Object.defineProperty(window, 'AudioContext', { value: replacement });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    }, audio);
    if (!await ready(page, info)) return;
    await startButton(page).click();
    const prompt = page.getByRole('dialog', { name: 'AUDIO UNAVAILABLE' });
    await expect(prompt).toBeVisible();
    await expect(page.locator('#hud')).toBeHidden();
    await prompt.getByRole('button', { name: 'PLAY WITH SOUND OFF' }).click();
    const progressedOrPaused = async () => {
      const { phase, beat } = await readMetrics(page);
      return phase === 'paused' || (phase === 'playing' && beat > 0.2);
    };
    await expect.poll(progressedOrPaused).toBe(true);
    const pause = page.getByRole('dialog', { name: 'PAUSED' });
    if (await pause.isVisible()) {
      await expect(pause).toContainText('Rendering fell behind');
      await pause.getByRole('button', { name: 'RESUME', exact: true }).click();
      record(info, 'PASS', 'Explicitly resumed the silent clock after a detected long frame');
    }
    await expect.poll(async () => {
      const { phase, beat } = await readMetrics(page);
      return phase === 'playing' && beat > 0.2;
    }).toBe(true);
    await expect(page.locator('#hud')).toBeVisible();
    await expect(fallback(page)).toBeHidden();
    record(info, 'PASS', `Explicit silent transport after ${audio} activation`);
  });
}
