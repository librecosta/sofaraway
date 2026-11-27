import { MathUtils } from 'three';
import { mulberry } from './textures.client';

export const CLOUD_FIELD_SIZE = 256;
export const CLOUD_FIELD_PERIOD = 12288;

export function makeDaybreakCloudField(seed = 0x271060) {
  const random = mulberry(seed);
  const size = CLOUD_FIELD_SIZE;
  // The warp moves at most .026 of a tile and slope lookups move one texel.
  const wrap = (i: number, length: number) => i < 0 ? i + length : i >= length ? i - length : i;
  const interpolate = (t: number) => t * t * (3 - 2 * t);
  const octave = (columns: number, rows = columns) => {
    const grid = Float32Array.from({ length: columns * rows }, random);
    return (x: number, y: number) => {
      const u = x * columns, v = y * rows;
      const i = Math.floor(u), j = Math.floor(v);
      const left = wrap(i, columns), right = wrap(i + 1, columns);
      const top = wrap(j, rows) * columns, bottom = wrap(j + 1, rows) * columns;
      const blend = interpolate(u - i);
      return MathUtils.lerp(MathUtils.lerp(grid[top + left], grid[top + right], blend),
        MathUtils.lerp(grid[bottom + left], grid[bottom + right], blend), interpolate(v - j));
    };
  };
  const warpX = octave(8, 7), warpZ = octave(7, 8);
  const primary = octave(57, 61), secondary = octave(93, 101);
  const height = new Float32Array(size * size);
  const pixels = new Uint8Array(size * size * 4).fill(255);
  const byte = (level: number) => Math.round(255 * MathUtils.clamp(level, 0, 1));
  const at = (x: number, z: number) => wrap(z, size) * size + wrap(x, size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const u = x / size, v = z / size;
    const wx = u + .052 * (warpX(u, v) - .5);
    const wz = v + .052 * (warpZ(u, v) - .5);
    const bank = MathUtils.smoothstep(primary(wx, wz), .20, .78);
    // Secondary rises form on the banks and leave the broad valleys intact.
    const swell = secondary(wx, wz) * bank;
    const index = z * size + x;
    height[index] = .76 * bank + .24 * swell;
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const index = z * size + x;
    pixels[index * 4] = byte(height[index]);
    pixels[index * 4 + 1] = byte(.5 + .94 * (height[at(x - 1, z)] - height[at(x + 1, z)]));
    pixels[index * 4 + 2] = byte(.5 + .94 * (height[at(x, z - 1)] - height[at(x, z + 1)]));
  }
  return pixels;
}
