import { surfacePresets } from './presets';
import type { SurfaceMaterialId } from './presets';

export const MATERIAL_SEED = 0x6583f7c1;
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const fract = (x: number) => x - Math.floor(x);
const ease = (t: number) => t * t * t * (10 + t * (6 * t - 15));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const modulo = (x: number, n: number) => (x % n + n) % n;

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 0x1b873593) ^ Math.imul(y, 0x85ebca6b) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

function noise(u: number, v: number, nx: number, ny: number, seed: number) {
  const x = fract(u) * nx, y = fract(v) * ny;
  const a = Math.floor(x), b = Math.floor(y);
  const c = (a + 1) % nx, d = (b + 1) % ny;
  const fx = ease(x - a), fy = ease(y - b);
  return lerp(lerp(hash(a, b, seed), hash(c, b, seed), fx), lerp(hash(a, d, seed), hash(c, d, seed), fx), fy);
}

function groove(t: number, inner: number, outer: number) {
  const f = fract(t);
  return 1 - ease(clamp((Math.min(f, 1 - f) - inner) / (outer - inner)));
}

interface Sample { height: number; tone: number; roughness: number }

/** u/v are normalized tile coordinates. Heights are in world units; tone is an sRGB-byte offset. */
export function sampleSurface(id: SurfaceMaterialId, u: number, v: number, seed = MATERIAL_SEED,
  out: Sample = { height: 0, tone: 0, roughness: 0 }): Sample {
  const { roughness } = surfacePresets[id];
  const slow = noise(u, v, 4, 4, seed) - 0.5;
  out.roughness = roughness;
  switch (id) {
    case 'alloy-satin-dark': {
      const micro = noise(u, v, 24, 20, seed ^ 71) - 0.5;
      out.height = 0.0011 * micro + 0.0005 * slow;
      out.tone = 3 * slow + 0.7 * micro;
      break;
    }
    case 'alloy-brushed-tech': {
      const brush = noise(u, v, 38, 3, seed ^ 107) - 0.5;
      out.height = 0.0028 * brush + 0.0006 * slow;
      out.tone = 2 * slow + 3 * brush;
      out.roughness = clamp(roughness + 0.105 * brush + 0.035 * slow);
      break;
    }
    case 'panel-recessed': {
      const joint = 1 - (1 - groove(u, 0.012, 0.042)) * (1 - groove(v, 0.012, 0.042));
      out.height = -0.017 * joint + 0.001 * slow;
      out.tone = -9 * joint + 3 * slow;
      break;
    }
    case 'panel-reinforced': {
      const joint = 1 - (1 - groove(u, 0.018, 0.09)) * (1 - groove(v, 0.014, 0.065));
      const channels = groove(u - 0.16, 0.012, 0.031) + groove(u - 0.84, 0.012, 0.031);
      out.height = -0.027 * joint - 0.012 * channels + 0.0009 * slow;
      out.tone = -10 * joint - 5 * channels + 2 * slow;
      break;
    }
    case 'floor-grip': {
      const joint = 1 - (1 - groove(u, 0.016, 0.068)) * (1 - groove(v, 0.010, 0.042));
      const grip = Math.cos(TAU * (9 * v + 0.18 * Math.sin(TAU * u))) * (1 - joint);
      out.height = -0.010 * joint + 0.0019 * grip + 0.0008 * slow;
      out.tone = -5 * joint + 1.7 * grip + 2 * slow;
      break;
    }
    case 'utility-polymer': {
      const grain = noise(u, v, 27, 29, seed ^ 185) - 0.5;
      out.height = 0.0015 * grain + 0.0003 * slow;
      out.tone = 2.5 * grain + 2 * slow;
      break;
    }
  }
  return out;
}

export function heightNormal(dx: number, dy: number): [number, number, number] {
  const length = Math.hypot(dx, dy, 1);
  return [-dx / length, -dy / length, 1 / length];
}

/** Texel centres; row zero is v=0, matching DataTexture.flipY=false. */
export function generateSurface(id: SurfaceMaterialId, seed = MATERIAL_SEED) {
  const { resolution: size, tile, color, roughnessMap } = surfacePresets[id];
  const height = new Float32Array(size * size);
  const base = new Uint8Array(size * size * 4), normal = new Uint8Array(base.length);
  const roughness = roughnessMap ? new Uint8Array(base.length) : undefined;
  const sample = { height: 0, tone: 0, roughness: 0 };
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    sampleSurface(id, (x + 0.5) / size, (y + 0.5) / size, seed, sample);
    const i = y * size + x, o = i * 4;
    height[i] = sample.height;
    base[o] = Math.round(r + sample.tone); base[o + 1] = Math.round(g + sample.tone);
    base[o + 2] = Math.round(b + sample.tone); base[o + 3] = 255;
    if (roughness) {
      roughness[o] = roughness[o + 1] = roughness[o + 2] = Math.round(sample.roughness * 255);
      roughness[o + 3] = 255;
    }
  }
  const ux = size / (2 * tile[0]), vy = size / (2 * tile[1]);
  const at = (x: number, y: number) => height[modulo(y, size) * size + modulo(x, size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * ux;
    const dy = (at(x, y + 1) - at(x, y - 1)) * vy;
    const [nx, ny, nz] = heightNormal(dx, dy);
    const o = (y * size + x) * 4;
    normal[o] = Math.round((nx + 1) * 127.5); normal[o + 1] = Math.round((ny + 1) * 127.5);
    normal[o + 2] = Math.round((nz + 1) * 127.5); normal[o + 3] = 255;
  }
  return { size, height, color: base, normal, roughness };
}
