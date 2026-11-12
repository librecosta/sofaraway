import { expect, test } from '@playwright/test';

test('the unified overview renders lit materials, effects and the existing models and worlds', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.getByRole('button', { name: /^credits$/i }).click();
  await page.getByRole('link', { name: 'Debug overview' }).click();
  await expect(page).toHaveURL(/\/debug\/\?vol=elsewhere$/);
  const previews = page.locator('canvas[data-ready=true]');
  await expect(previews).toHaveCount(31);
  for (const name of ['Surface materials', 'Effect materials', 'Structural kit', 'Loose props', 'Environment', 'Soundtrack']) {
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
    'overhead-assembly', 'ventilation-assembly', 'utility-conduits', 'service-bay', 'holographic-service-door',
    'tech-crate', 'utility-barrel', 'sky', 'stars',
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

  const fan = page.locator('[data-preview=ventilation-assembly][data-mode=model]');
  const front = await fan.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('slider', { name: 'Kit view angle' }).focus();
  await page.keyboard.press('Home');
  expect(await fan.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(front);
  for (const [id, name] of [['tech-crate', 'Tech crate'], ['utility-barrel', 'Utility barrel']]) {
    const prop = page.locator(`[data-preview=${id}][data-mode=model]`);
    const standing = await prop.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.getByRole('button', { name: `Preview ${name} impact` }).click();
    await expect.poll(() => prop.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(standing);
  }

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
  await expect(page.getByRole('slider', { name: 'Kit view angle' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Preview Tech crate impact' })).toBeDisabled();
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
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('canvas[data-mode=lit], canvas[data-mode=model]')) delete canvas.dataset.mode;
    window.dispatchEvent(new Event('test-debug-restore'));
  });
  await expect(page.locator('#materials canvas[data-mode=lit]')).toHaveCount(6);
  await expect(page.locator('canvas[data-mode=model]')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Animate scan' })).toBeEnabled();
});
