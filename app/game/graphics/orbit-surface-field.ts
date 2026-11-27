const fade = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function gradientCode(x: number, y: number, z: number, seed: number) {
  const h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ seed;
  const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
  return (mixed ^ (mixed >>> 16)) & 15;
}

function gradientDot(h: number, dx: number, dy: number, dz: number) {
  const u = h < 8 ? dx : dy;
  const v = h < 4 ? dy : h === 12 || h === 14 ? dx : dz;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

/** Periodic gradient noise with continuous coordinates. */
export function stoneNoise(x: number, y: number, z: number, period: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const wrap = (v: number) => (v % period + period) % period;
  const at = (a: number, b: number, c: number) =>
    gradientDot(gradientCode(wrap(ix + a), wrap(iy + b), wrap(iz + c), seed), fx - a, fy - b, fz - c);
  const u = fade(fx), v = fade(fy), w = fade(fz);
  return .5 + .5 * mix(mix(mix(at(0, 0, 0), at(1, 0, 0), u), mix(at(0, 1, 0), at(1, 1, 0), u), v),
    mix(mix(at(0, 0, 1), at(1, 0, 1), u), mix(at(0, 1, 1), at(1, 1, 1), u), v), w);
}

function periodicGrid(size: number, period: number, seed: number) {
  // Every axis samples the same grid. Cache the wrapped corners and cubic
  // weights, then blend in the original x, y, z order for each texel.
  const lattice = new Uint8Array(period ** 3);
  for (let z = 0; z < period; z++) for (let y = 0; y < period; y++) for (let x = 0; x < period; x++) {
    lattice[(z * period + y) * period + x] = gradientCode(x, y, z, seed);
  }
  const axis = Array.from({ length: size }, (_, i) => {
    const coord = (i + .5) / size * period;
    const lower = Math.floor(coord);
    const fraction = coord - lower;
    return { lower, upper: (lower + 1) % period, fraction, weight: fade(fraction) };
  });
  return (x: number, y: number, z: number) => {
    const ax = axis[x], ay = axis[y], az = axis[z];
    const dx = ax.fraction, dy = ay.fraction, dz = az.fraction;
    const row00 = (az.lower * period + ay.lower) * period;
    const row01 = (az.lower * period + ay.upper) * period;
    const row10 = (az.upper * period + ay.lower) * period;
    const row11 = (az.upper * period + ay.upper) * period;
    return .5 + .5 * mix(
      mix(
        mix(gradientDot(lattice[row00 + ax.lower], dx, dy, dz), gradientDot(lattice[row00 + ax.upper], dx - 1, dy, dz), ax.weight),
        mix(gradientDot(lattice[row01 + ax.lower], dx, dy - 1, dz), gradientDot(lattice[row01 + ax.upper], dx - 1, dy - 1, dz), ax.weight),
        ay.weight),
      mix(
        mix(gradientDot(lattice[row10 + ax.lower], dx, dy, dz - 1), gradientDot(lattice[row10 + ax.upper], dx - 1, dy, dz - 1), ax.weight),
        mix(gradientDot(lattice[row11 + ax.lower], dx, dy - 1, dz - 1), gradientDot(lattice[row11 + ax.upper], dx - 1, dy - 1, dz - 1), ax.weight),
        ay.weight),
      az.weight);
  };
}

export function stoneVolume(size = 32) {
  const data = new Uint8Array(size ** 3 * 4);
  for (const [channel, period] of [4, 7, 11, 5].entries()) {
    const sample = periodicGrid(size, period, 1207 + channel * 991);
    let i = channel;
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
      data[i] = Math.round(Math.max(0, Math.min(1, sample(x, y, z))) * 255);
    }
  }
  return data;
}

const cellPeriod = 4;
function cellIndex(x: number, y: number, z: number) {
  const wrap = (v: number) => (v + cellPeriod) % cellPeriod;
  return (wrap(z) * cellPeriod + wrap(y)) * cellPeriod + wrap(x);
}

function cellRandom(x: number, y: number, z: number, channel: number) {
  const h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ Math.imul(channel + 17, 1597334677);
  const mixed = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function featureNeighborhoods() {
  const offsets: [number, number, number][] = [];
  for (let z = 0; z < cellPeriod; z++) for (let y = 0; y < cellPeriod; y++) for (let x = 0; x < cellPeriod; x++) {
    offsets.push([.64 * cellRandom(x, y, z, 0), .64 * cellRandom(x, y, z, 1), .64 * cellRandom(x, y, z, 2)]);
  }
  const neighborhoods = [];
  // Start in the current cell so distant cells can be rejected sooner.
  const neighbors = [0, -1, 1];
  for (let z = 0; z < cellPeriod; z++) for (let y = 0; y < cellPeriod; y++) for (let x = 0; x < cellPeriod; x++) {
    const points = [];
    for (const dz of neighbors) for (const dy of neighbors) for (const dx of neighbors) {
      const cx = x + dx, cy = y + dy, cz = z + dz;
      const [ox, oy, oz] = offsets[cellIndex(cx, cy, cz)];
      points.push({ cx, cy, cz, ox, oy, oz });
    }
    neighborhoods.push(points);
  }
  return neighborhoods;
}

/** A periodic rock field holding joint distance, grains, weathering and pits. */
export function asteroidSurfaceVolume(size = 64) {
  const data = new Uint8Array(size ** 3 * 4);
  const neighborhoods = featureNeighborhoods();
  const axis = Array.from({ length: size }, (_, i) => {
    const position = (i + .5) / size * cellPeriod;
    return { position, cell: Math.floor(position) };
  });
  const grain = periodicGrid(size, 8, 3813);
  const weathering = periodicGrid(size, 4, 8917);
  let i = 0;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++, i += 4) {
    const ax = axis[x], ay = axis[y], az = axis[z];
    const points = neighborhoods[(az.cell * cellPeriod + ay.cell) * cellPeriod + ax.cell];
    let first = Infinity, second = Infinity, secondSquared = Infinity;
    for (const { cx, cy, cz, ox, oy, oz } of points) {
      const dx = ax.position - cx - .18 - ox;
      const dy = ay.position - cy - .18 - oy;
      const dz = az.position - cz - .18 - oz;
      // Use the original distance for contenders, including any floating-point ties.
      if (dx * dx + dy * dy + dz * dz > secondSquared + 1e-12) continue;
      const distance = Math.hypot(dx, dy, dz);
      if (distance < first) { second = first; first = distance; }
      else if (distance < second) second = distance;
      secondSquared = second * second;
    }
    data[i] = Math.round(Math.min(1, (second - first) * 2) * 255);
    data[i + 1] = Math.round(grain(x, y, z) * 255);
    data[i + 2] = Math.round(weathering(x, y, z) * 255);
    data[i + 3] = Math.round(Math.min(1, first) * 255);
  }
  return data;
}
