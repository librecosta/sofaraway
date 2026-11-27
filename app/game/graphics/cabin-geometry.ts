import * as THREE from 'three';
import { SECTION, SECTION_OUTLINE } from '../core/section';
import { pathFrame } from './branch-path';
import type { PathFrame } from './path';
import { surfaceUV } from './materials/uv';

export const CABIN_WAIST = .55;
export const CABIN_HOOP = 21;
const [floorLeft, floorRight, lowerRight, upperRight, roofRight, roofLeft, upperLeft, lowerLeft] = SECTION_OUTLINE;
const leftWaist = [-SECTION.a, CABIN_WAIST] as const;
const rightWaist = [SECTION.a, CABIN_WAIST] as const;
export const cabinLower = [leftWaist, lowerLeft, floorLeft, floorRight, lowerRight, rightWaist] as const;
export const cabinUpper = [leftWaist, upperLeft, roofLeft, roofRight, upperRight, rightWaist] as const;

interface CabinSpan {
  from: number;
  to: number;
  sample: (station: number, frame: PathFrame) => PathFrame;
  widen?: (station: number) => number;
  raise?: (station: number) => number;
}

export function cabinEnvelope(spans: readonly CabinSpan[], spacing: number, upper: boolean) {
  const points = upper ? cabinUpper : cabinLower;
  const pos: number[] = [], uv: number[] = [], indices: number[] = [];
  const fr = pathFrame(), world = new THREE.Vector3();
  for (const { from, to, sample, widen, raise } of spans) {
    const stations = [from];
    for (let s = (Math.floor(from / spacing) + 1) * spacing; s < to - 1e-7; s += spacing) stations.push(s);
    stations.push(to);
    const first = pos.length / 3;
    const width = (points.length - 1) * 2;
    for (const [ring, station] of stations.entries()) {
      sample(station, fr);
      const extra = widen?.(station) ?? 0;
      const rise = raise?.(station) ?? 0;
      let along = 0;
      for (let edge = 1; edge < points.length; edge++) {
        const a = points[edge - 1], b = points[edge];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (const [i, [x, y]] of [a, b].entries()) {
          const height = y + (y > CABIN_WAIST ? rise : 0);
          world.copy(fr.p).addScaledVector(fr.r, x + Math.sign(x) * extra).addScaledVector(fr.u, height);
          pos.push(...world);
          uv.push(...(upper ? [i, station / CABIN_HOOP] : surfaceUV('alloy-satin-dark', along + i * length, 0, 0, station)));
        }
        if (ring) {
          const v = first + (ring - 1) * width + (edge - 1) * 2;
          indices.push(v, v + 1, v + width + 1, v, v + width + 1, v + width);
        }
        along += length;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
