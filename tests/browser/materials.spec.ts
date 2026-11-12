import { expect, test } from '@playwright/test';

test('ELSEWHERE shell joins share world UVs and material ownership; GPU decodes sRGB once', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090');
  await page.waitForFunction(() => !!window.b0Harness);
  const result = await page.evaluate(() => window.b0Harness.inspectMaterials());
  expect(result.boundary[0]).toHaveLength(3);
  expect(result.boundary[0].every(points => points.length >= 2)).toBe(true);
  expect(result.boundary[0]).toEqual(result.boundary[1]);
  expect(result.sameMaterials).toBe(true);
  expect(result.materialIds).toEqual(['alloy-satin-dark', 'panel-recessed', 'floor-grip', 'panel-reinforced', 'alloy-brushed-tech']);
  expect(result.textureCount).toBe(11);
  expect(result.disposedWithTunnel).toBe(0);
  expect(result.disposed).toBe(11);
  expect(result.colorMetadata.filter(value => value === 'srgb')).toHaveLength(5);
  expect(result.colorMetadata.filter(value => value === '')).toHaveLength(6);
  expect(result.roughness).toBe(1);
  expect(result.glError).toBe(0);
  for (const [i, byte] of result.decoded.entries()) {
    expect(Math.abs(byte - result.expected[i])).toBeLessThanOrEqual(1);
    expect(byte).toBeLessThan(result.raw[i] - 20);
  }
  console.log('M0 MAPS', JSON.stringify({ generation: result.generation, raw: result.raw, linear: result.decoded }));
});
