import { MathUtils } from 'three';
import { runRandomWord } from '../core/run-seed';

export const CIRRUS_WIDTH = 512;
export const CIRRUS_HEIGHT = 256;
export const cirrusLayers = ['Composite', 'Main Only', 'Secondary Only'] as const;
export type CirrusLayer = typeof cirrusLayers[number];

const { degToRad, lerp, smoothstep, clamp } = MathUtils;
const tau = Math.PI * 2;
// Angles are relative to world -Z. Positive tilt rises toward +X.
const azimuth = degToRad(-18), elevation = degToRad(27), tilt = degToRad(8);
const halfWidth = degToRad(6.4), bend = degToRad(9);
const meanWidth = .97, widthWave2 = .17, widthWave3 = .11;
const branches = [
  { offset: -10.5, halfWidth: 4.25, density: .44, phase: .52, fringeReach: 7.3, fringeStrength: .18 },
  { offset: 14, halfWidth: 3, density: .29, phase: -.9, fringeReach: 6, fringeStrength: .24 },
].map(branch => ({ ...branch, offset: degToRad(branch.offset), halfWidth: degToRad(branch.halfWidth),
  fringeReach: degToRad(branch.fringeReach) }));
// Beyond this latitude every band's body and fringe are zero, even at maximum bend and width.
const maxWidth = meanWidth + widthWave2 + widthWave3;
const maxBandExtent = Math.max(halfWidth * maxWidth, ...branches.map(branch =>
  Math.abs(branch.offset) + Math.max(branch.halfWidth * maxWidth, branch.fringeReach)));
const sideLimit = Math.min(.62, Math.sin(bend + maxBandExtent + 1e-6));

function flowNoise(lon: number, across: number, cells: number, seed: number) {
  const along = lon * cells / tau;
  const col = Math.floor(along), row = Math.floor(across);
  const west = (col + cells) % cells, east = (west + 1) % cells;
  const noise = (x: number, y: number) =>
    runRandomWord(seed, Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841)) / 0xffffffff;
  const u = smoothstep(along - col, 0, 1), v = smoothstep(across - row, 0, 1);
  return lerp(lerp(noise(west, row), noise(east, row), u), lerp(noise(west, row + 1), noise(east, row + 1), u), v) * 2 - 1;
}

function texturedDensity(lon: number, across: number, shape: number, center: number, seed: number) {
  if (shape <= 0) return 0;
  // Follow the local centerline first, then warp just the strands.
  const strand = across * (1 + .16 * Math.sin(3 * lon + .8))
    + .057 * flowNoise(lon, 5 * across + center, 13, seed);
  const fork = strand + .020 * flowNoise(lon, 14 * strand + center, 21, seed + 1);
  const fiber = .51 * flowNoise(lon, 27 * strand + center, 11, seed + 2)
    + .34 * flowNoise(lon, 53 * fork + center, 23, seed + 3)
    + .15 * flowNoise(lon, 91 * fork + center, 37, seed + 4);
  const threads = .28 + .72 * smoothstep(fiber, -.48, .53);
  const dissipation = .82 + .18 * flowNoise(lon, center, 7, seed + 5);
  return shape * threads * dissipation;
}

// Uses the reference's tilted spherical frame and height-squared bake with DAYBREAK's own geometry and noise.
export function makeDaybreakCirrusField(seed = 0x2d5f31) {
  const data = new Uint8Array(CIRRUS_WIDTH * CIRRUS_HEIGHT * 4);
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth), ce = Math.cos(elevation), se = Math.sin(elevation);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const headings = Array.from({ length: CIRRUS_WIDTH }, (_, column) => {
    const angle = ((column + .5) / CIRRUS_WIDTH - .5) * tau;
    const x = Math.sin(angle), z = -Math.cos(angle);
    return [sa * x - ca * z, ca * x + sa * z];
  });
  const densityByte = (density: number) => Math.round(density * 255);
  for (let row = 0; row < CIRRUS_HEIGHT; row++) {
    const height = (row / (CIRRUS_HEIGHT - 1)) ** 2;
    const altitudeFade = smoothstep(height, .102, .25) * (1 - smoothstep(height, .79, .96));
    if (altitudeFade === 0) continue;
    const radius = Math.sqrt(1 - height * height);
    for (let col = 0; col < CIRRUS_WIDTH; col++) {
      const [front, east] = headings[col];
      const up = ce * height - se * radius * front;
      const side = ct * up - st * radius * east;
      if (Math.abs(side) > sideLimit) continue;
      const lon = Math.atan2(ct * radius * east + st * up, ce * radius * front + se * height);
      const spine = bend * (.67 * Math.sin(2 * lon - 1.1) + .33 * Math.sin(3 * lon + .6));
      const across = Math.asin(clamp(side, -1, 1)) - spine;
      const width = meanWidth + widthWave2 * Math.cos(2 * lon - .8) + widthWave3 * Math.sin(3 * lon + .2);
      const light = altitudeFade * (.34 + .66 * smoothstep(Math.cos(lon + .32), -.25, .94));
      const span = halfWidth * width;
      const body = .70 + .30 * smoothstep(Math.cos(lon + .47), .13, .93);
      const main = .94 * light * body * (1 - smoothstep(Math.abs(across), .16 * span, span));
      let secondary = 0, secondaryFibers = 0;
      for (const [index, branch] of branches.entries()) {
        const separation = branch.offset * (.58 + .42 * Math.sin(2 * lon + branch.phase));
        const distance = across - separation;
        const span = branch.halfWidth * width;
        const body = 1 - smoothstep(Math.abs(distance), .09 * span, span);
        const outward = Math.sign(branch.offset) * distance;
        const fringe = smoothstep(outward, .32 * span, .9 * span) * (1 - smoothstep(outward, .55 * branch.fringeReach, branch.fringeReach));
        const fade = .15 + .85 * smoothstep(Math.cos(lon - branch.phase), -.24, .94);
        const density = light * branch.density * fade * (body + branch.fringeStrength * fringe);
        secondary += (1 - secondary) * density;
        secondaryFibers += (1 - secondaryFibers) * texturedDensity(lon, distance, density, 3 + index * 6, seed + index * 11 + 31);
      }
      const offset = 4 * (row * CIRRUS_WIDTH + col);
      data[offset] = densityByte(main);
      data[offset + 1] = densityByte(secondary);
      data[offset + 2] = densityByte(texturedDensity(lon, across, main, .7, seed));
      data[offset + 3] = densityByte(secondaryFibers);
    }
  }
  return data;
}
