import { MathUtils } from 'three';
import { mulberry } from './textures.client';

export const CLOUD_FIELD_SIZE = 256;
export const CLOUD_FIELD_PERIOD = 12288;

export function makeDaybreakCloudField(seed = 0x271060) {
  const random = mulberry(seed);
  const size = CLOUD_FIELD_SIZE;
  const wrap = (i: number, length: number) => (i % length + length) % length;
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
  const cirrusBands = octave(4, 47), cirrusBreaks = octave(8, 13), cirrusFibres = octave(14, 79);
  const height = new Float32Array(size * size);
  const pixels = new Uint8Array(size * size * 4);
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

    const bend = v + .065 * (warpZ(u + .28, v) - .5);
    const strand = MathUtils.smoothstep(cirrusBands(u, bend), .61, .93);
    const broken = MathUtils.smoothstep(cirrusBreaks(u, v), .36, .73);
    const fibre = cirrusFibres(u, bend);
    pixels[index * 4 + 3] = byte(strand * broken * (.34 + .66 * fibre));
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const index = z * size + x;
    pixels[index * 4] = byte(height[index]);
    pixels[index * 4 + 1] = byte(.5 + .94 * (height[at(x - 1, z)] - height[at(x + 1, z)]));
    pixels[index * 4 + 2] = byte(.5 + .94 * (height[at(x, z - 1)] - height[at(x, z + 1)]));
  }
  return pixels;
}
