import { expect, test } from 'vitest';
import { surfaceIds, surfacePresets } from '../../app/game/graphics/materials/presets';
import { generateSurface, heightNormal, MATERIAL_SEED, sampleSurface } from '../../app/game/graphics/materials/surface';
import { satinRepeat, shellPerimeter, surfaceUV } from '../../app/game/graphics/materials/uv';

test.each(surfaceIds)('%s repeats color, height and first derivatives at both tile boundaries', id => {
  const sample = (u: number, v: number) => sampleSurface(id, u, v);
  const d = 1e-5;
  for (const across of [0, 0.04, 0.27, 0.53, 0.93, 1]) {
    expect(sample(0, across)).toEqual(sample(1, across));
    expect(sample(across, 0)).toEqual(sample(across, 1));
    for (const axis of [0, 1]) {
      const h = (value: number) => (axis === 0 ? sample(value, across) : sample(across, value)).height;
      expect(Math.abs((h(d) - h(0)) / d - (h(1) - h(1 - d)) / d)).toBeLessThan(0.0002);
      expect((h(d) - h(-d)) / (2 * d)).toBeCloseTo((h(1 + d) - h(1 - d)) / (2 * d), 6);
    }
  }
});

test.each(surfaceIds)('%s produces deterministic channels and physically scaled wrapped normals', id => {
  const preset = surfacePresets[id];
  const a = generateSurface(id), b = generateSurface(id, MATERIAL_SEED);
  expect(a).toEqual(b);
  expect(generateSurface(id, MATERIAL_SEED + 1).height).not.toEqual(a.height);
  expect(a.roughness !== undefined).toBe(preset.roughnessMap);
  expect(preset.metalness).toBeGreaterThanOrEqual(0);
  expect(preset.metalness).toBeLessThanOrEqual(1);
  const size = a.size;
  const at = (x: number, y: number) => a.height[((y + size) % size) * size + (x + size) % size];
  for (const [x, y] of [[0, 13], [size - 1, 0], [11, size - 1], [30, 50]]) {
    const offset = (y * size + x) * 4;
    const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * preset.tile[0] / size);
    const dy = (at(x, y + 1) - at(x, y - 1)) / (2 * preset.tile[1] / size);
    const normal = Array.from(a.normal.subarray(offset, offset + 3), n => n / 127.5 - 1);
    expect(Math.hypot(...normal)).toBeCloseTo(1, 2);
    expect(normal).toEqual(heightNormal(dx, dy).map(n => Math.round((n + 1) * 127.5) / 127.5 - 1));
    expect(normal[0] * dx).toBeLessThanOrEqual(0.004 * Math.abs(dx));
    expect(normal[1] * dy).toBeLessThanOrEqual(0.004 * Math.abs(dy));
    const sample = sampleSurface(id, (x + 0.5) / size, (y + 0.5) / size);
    expect(sample.roughness).toBeGreaterThanOrEqual(0);
    expect(sample.roughness).toBeLessThanOrEqual(1);
    if (a.roughness) expect(a.roughness[offset + 1]).toBe(Math.round(sample.roughness * 255));
  }
});

test('closed satin and the integer wall and floor modules use fixed physical stations', () => {
  expect(surfaceUV('alloy-satin-dark', 0, shellPerimeter, 1, 0)[0]).toBeCloseTo(satinRepeat, 12);
  expect(surfaceUV('alloy-satin-dark', 0, 3, 1, 1.2)[1]).toBe(1);
  expect(surfaceUV('panel-recessed', 8, 3.5, 1, 4410)).toEqual([2, 2940]);
  expect(surfaceUV('floor-grip', 0, 5.1, 1, 4410)).toEqual([7, 2940]);
  expect(surfaceUV('alloy-brushed-tech', 0, 0.8, 1, 1.6)).toEqual([1, 1]);
});
