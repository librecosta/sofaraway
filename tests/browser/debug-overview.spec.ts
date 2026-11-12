import { expect, test } from '@playwright/test';

test('the unified overview renders actual models, worlds, gates and material swatches', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await page.getByRole('button', { name: /^credits$/i }).click();
  await page.getByRole('link', { name: 'Debug overview' }).click();
  await expect(page).toHaveURL(/\/debug\/\?vol=elsewhere$/);
  const previews = page.locator('canvas[data-ready=true]');
  await expect(previews).toHaveCount(17);
  const samples = await previews.evaluateAll(elements => (elements as HTMLCanvasElement[]).map(canvas => {
    const { width, height } = canvas;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, width, height);
    const colors = new Set<number>();
    for (let i = 0; i < data.length; i += 20) colors.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
    return { id: canvas.dataset.preview, painted: colors.size > 1 };
  }));
  expect(samples).toEqual([
    'shield', 'resonance', 'lumen', 'elsewhere', 'drift', 'descent', 'orbit',
    'iris', 'square', 'diamond', 'shutter', 'lattice', 'aperture', 'hull', 'normal', 'sky', 'stars',
  ].map(id => ({ id, painted: true })));
  const shield = page.getByRole('img', { name: 'Prism Shield 3D model' });
  const first = await shield.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByRole('slider', { name: 'View angle' }).focus();
  await page.keyboard.press('End');
  expect(await shield.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(first);

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
  await expect(page.getByRole('slider', { name: 'View angle' })).toBeDisabled();
  await expect(page.locator('#materials canvas[data-ready=true]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Render to WAV' })).toBeEnabled();
});
