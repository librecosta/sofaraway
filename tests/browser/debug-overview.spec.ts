import { expect, test } from '@playwright/test';

test('lighting studio starts from the game score and isolates the dual-color comparison at the same station', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/debug/');
  const studio = page.locator('#lighting');
  await studio.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = studio.getByRole('img', { name: 'Live ELSEWHERE lighting' });
  await expect(canvas).toHaveAttribute('data-zone', 'pure-frame');
  const scene = studio.getByLabel('Corridor type');
  await scene.selectOption({ label: 'Helical Wash' });
  await expect(canvas).toHaveAttribute('data-zone', 'helical-wash');
  await expect(studio.locator('option[value=dual-color]')).toHaveAttribute('disabled', '');
  await scene.selectOption({ label: 'Staggered Cells' });
  await expect(canvas).toHaveAttribute('data-zone', 'staggered-cells');
  await expect(studio.getByLabel('Score chapter')).toHaveValue('2');

  const href = (await studio.getByRole('link', { name: 'Open this station in game' }).getAttribute('href'))!;
  const game = await page.context().newPage();
  try {
    await game.goto(href + '&dbg=1&ui=0');
    await expect(game.locator('#errbox')).toContainText('"phase":"playing"');
    const metrics = JSON.parse((await game.locator('#errbox').textContent())!);
    expect(metrics.scenicLights.zone).toBe('staggered-cells');
    expect(metrics.scenicLights.groups).toBe(2);
    const previewRim: number[] = JSON.parse((await canvas.getAttribute('data-rim'))!);
    previewRim.forEach((value, i) => expect(value).toBeCloseTo(metrics.scenicLights.rim[i], 6));
    expect(Number(await canvas.getAttribute('data-hue'))).toBeCloseTo(metrics.scenicLights.hue, 6);
  } finally { await game.close(); }

  const station = await canvas.getAttribute('data-station');
  const sameBeat = await canvas.getAttribute('data-light-beat');
  const single = await canvas.screenshot();
  await studio.getByLabel('Lighting pattern').selectOption('dual-color');
  await expect.poll(async () => (await canvas.screenshot()).equals(single)).toBe(false);
  await expect(canvas).toHaveAttribute('data-light-beat', sameBeat!);
  await expect(canvas).toHaveAttribute('data-station', station!);
  await studio.getByRole('button', { name: 'Play lights' }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-light-beat'))).toBeGreaterThan(Number(sameBeat));
  await studio.getByRole('button', { name: 'Pause lights' }).click();
  const beat = await canvas.getAttribute('data-light-beat');
  const lost = await canvas.evaluate((el: HTMLCanvasElement) => {
    const extension = el.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    el.addEventListener('restore-scenic', () => extension.restoreContext(), { once: true });
    extension.loseContext();
    return true;
  });
  expect(lost).toBe(true);
  await expect(studio.getByRole('status')).toContainText('Waiting to restore');
  await canvas.dispatchEvent('restore-scenic');
  await expect(studio.getByRole('status')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-station', station!);
  await expect(canvas).toHaveAttribute('data-light-beat', beat!);
  await scene.selectOption({ label: 'Challenge tunnel' });
  await expect(canvas).toHaveAttribute('data-route', 'challenge');
  for (const [label, kind] of [['Triple Helix', 'triple-helix'], ['Connected Flow', 'connected-flow'],
    ['Raked Bands', 'raked-bands']]) {
    await scene.selectOption({ label });
    await expect(canvas).toHaveAttribute('data-zone', kind);
  }
  await studio.getByLabel('Play mode').selectOption('sightseeing');
  await expect(canvas).toHaveAttribute('data-mode', 'sightseeing');
  await expect(canvas).toHaveAttribute('data-zone', 'raked-bands');
  let previous = 0;
  for (const label of ['Entry', 'First lateral peak', 'Midpoint', 'Second lateral peak', 'Exit']) {
    await studio.getByRole('button', { name: label, exact: true }).click();
    await expect.poll(async () => Number(await canvas.getAttribute('data-station'))).toBeGreaterThan(previous > 0 ? previous : 5000);
    previous = Number(await canvas.getAttribute('data-station'));
  }
  await expect(studio.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the unified overview renders lit materials, effects and the existing models and worlds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.getByRole('button', { name: /^credits$/i }).click();
  await page.getByRole('link', { name: 'Debug overview' }).click();
  await expect(page).toHaveURL(/\/debug\/\?vol=elsewhere$/);
  const previews = page.locator('canvas[data-ready=true]');
  await expect(previews).toHaveCount(24);
  await expect(page.getByRole('heading', { name: /loose props|cargo group/i })).toHaveCount(0);
  for (const name of ['Surface materials', 'Effect materials', 'Lighting & scenic composition', 'Environment', 'Soundtrack']) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await expect(page.locator('#materials canvas[data-mode=lit]')).toHaveCount(6);
  await expect(page.locator('#effects canvas[data-mode=effect]')).toHaveCount(2);
  const samples = await previews.evaluateAll(elements => (elements as HTMLCanvasElement[]).map(canvas => {
    const { width, height } = canvas;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 20) colors.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
    return { id: canvas.dataset.preview, painted: colors.size > 1 };
  }));
  expect(samples).toEqual([
    'shield', 'resonance', 'lumen', 'elsewhere', 'drift', 'descent', 'orbit',
    'iris', 'square', 'diamond', 'shutter', 'lattice', 'aperture',
    'alloy-satin-dark', 'alloy-brushed-tech', 'panel-recessed', 'panel-reinforced', 'floor-grip', 'utility-polymer',
    'surface-channel', 'emissive-channel-cyan', 'hologram-panel-cyan',
    'sky', 'stars',
  ].map(id => ({ id, painted: true })));
  const shield = page.getByRole('img', { name: 'Prism Shield 3D model' });
  const first = await shield.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('slider', { name: 'View angle', exact: true }).focus();
  await page.keyboard.press('End');
  expect(await shield.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(first);

  const raw = page.locator('canvas[data-preview=surface-channel]');
  const before = await raw.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('button', { name: 'Height' }).click();
  await expect(raw).toHaveAttribute('data-channel', 'height');
  expect(await raw.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
  await expect(page.getByRole('button', { name: 'Roughness', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Surface' }).selectOption('alloy-brushed-tech');
  await page.getByRole('button', { name: 'Roughness', exact: true }).click();
  await expect(raw).toHaveAttribute('data-channel', 'roughness');
  await expect(raw).toHaveAttribute('data-surface', 'alloy-brushed-tech');
  const film = page.locator('canvas[data-preview=hologram-panel-cyan]');
  const still = await film.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const scan = page.getByRole('button', { name: 'Animate scan' });
  await scan.click();
  await expect.poll(() => film.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(still);
  await scan.click();

  await page.setViewportSize({ width: 360, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  expect(errors).toEqual([]);
});

test('materials and the soundtrack controls are available without WebGL2', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, ...args]);
      },
    });
  });
  await page.goto('/debug/');
  await expect(page.getByText('WebGL2 is needed for 3D previews.')).toBeVisible();
  await expect(page.getByRole('slider', { name: 'View angle', exact: true })).toBeDisabled();
  await expect(page.locator('#materials canvas[data-mode=raw]')).toHaveCount(6);
  await expect(page.locator('#materials canvas[data-mode=lit]')).toHaveCount(0);
  await expect(page.getByText(/Lit previews unavailable/)).toBeVisible();
  await expect(page.locator('#environment canvas[data-ready=true]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(page.locator('canvas[data-preview=surface-channel]')).toHaveAttribute('data-channel', 'normal');
  await expect(page.getByRole('button', { name: 'Render to WAV' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'First lateral peak' })).toBeDisabled();
});

test('the debug material renderer restores one context and redraws the lit specimens', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    const contexts: WebGL2RenderingContext[] = [];
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        const ctx = Reflect.apply(original, this, [type, ...args]);
        if (type === 'webgl2' && ctx && !contexts.includes(ctx)) contexts.push(ctx);
        return ctx;
      },
    });
    window.addEventListener('test-debug-loss', () => {
      const extension = contexts[0]?.getExtension('WEBGL_lose_context');
      if (!extension) return;
      window.addEventListener('test-debug-restore', () => extension.restoreContext(), { once: true });
      extension.loseContext();
    });
  });
  await page.goto('/debug/');
  await expect(page.locator('#materials canvas[data-mode=lit]')).toHaveCount(6);
  await page.evaluate(() => window.dispatchEvent(new Event('test-debug-loss')));
  await expect(page.getByText(/Waiting for WebGL/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Animate scan' })).toBeDisabled();
  await page.evaluate(() => {
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-mode=lit], canvas[data-mode=effect]')) delete canvas.dataset.mode;
    window.dispatchEvent(new Event('test-debug-restore'));
  });
  await expect(page.locator('#materials canvas[data-mode=lit]')).toHaveCount(6);
  await expect(page.locator('canvas[data-mode=effect]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Animate scan' })).toBeEnabled();
});
