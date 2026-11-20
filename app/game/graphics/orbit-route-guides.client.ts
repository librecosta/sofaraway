import * as THREE from 'three';
import { routeSides } from '../core/branches';
import type { BranchLayout, RouteSide } from '../core/branches';
import { ease } from '../core/lighting-score';
import { orbitRouteSwatches } from '../core/orbit-routes';
import { SECTION } from '../core/section';
import { BranchPath, pathFrame } from './branch-path';

// Below the shared octagonal hull: traces never run through a gate's openings.
export const ORBIT_TRACE_DROP = SECTION.b + .32;

/** Five connected spans in one ribbon mesh; center positions come only from BranchPath. */
export function orbitTraceGeometry(path: BranchPath) {
  const positions: number[] = [], tangents: number[] = [], metadata: number[] = [], indices: number[] = [];
  const sample = pathFrame(), center = pathFrame();
  const spans = [
    { from: path.guideStart - 80, to: path.split, side: 'center', group: 3 },
    ...routeSides.map((side, group) => ({ from: path.split, to: path.end, side, group })),
    { from: path.end, to: path.end + 90, side: 'center', group: 3 },
  ] as const;
  for (const span of spans) {
    const count = Math.ceil((span.to - span.from) / 2);
    const first = positions.length / 3;
    for (let i = 0; i <= count; i++) {
      const station = THREE.MathUtils.lerp(span.from, span.to, i / count);
      path.sample(station, span.side, sample);
      path.sample(station, 'center', center);
      const spread = span.side === 'center' ? 1 : ease(sample.p.distanceTo(center.p) / .7);
      sample.p.addScaledVector(sample.u, -ORBIT_TRACE_DROP);
      for (const edge of [-1, 1]) {
        positions.push(...sample.p); tangents.push(...sample.f);
        metadata.push(edge, station, span.group, spread);
      }
      if (i < count) { const a = first + i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('tangent', new THREE.Float32BufferAttribute(tangents, 3));
  geometry.setAttribute('trace', new THREE.Float32BufferAttribute(metadata, 4));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export class OrbitRouteGuides {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly colors: THREE.Color[];
  private phase = 'hidden';

  constructor(readonly path: BranchPath, readonly layout: BranchLayout) {
    this.colors = routeSides.map(side => new THREE.Color(orbitRouteSwatches[layout[side]]));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { colors: { value: this.colors }, viewport: { value: new THREE.Vector2(960, 540) },
        time: { value: 0 }, motion: { value: 0 }, gain: { value: 0 }, selected: { value: -1 },
        locked: { value: 0 }, bounds: { value: new THREE.Vector2(path.guideStart - 80, path.end + 90) } },
      vertexShader: /* glsl */`
        attribute vec3 tangent;
        attribute vec4 trace;
        uniform vec2 viewport;
        varying vec4 vTrace;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vec4 clip = projectionMatrix * view;
          vec4 ahead = projectionMatrix * (view + modelViewMatrix * vec4(tangent, 0.0));
          vec2 direction = (ahead.xy / ahead.w - clip.xy / clip.w) * viewport;
          direction = length(direction) > .00001 ? normalize(direction) : vec2(0., 1.);
          vec2 normal = vec2(-direction.y, direction.x);
          float halfWidth = clamp(.045 * projectionMatrix[1][1] * viewport.y / max(1., -view.z), 1.25, 3.4);
          clip.xy += normal * trace.x * halfWidth * 2.0 / viewport * clip.w;
          gl_Position = clip;
          vTrace = trace;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 colors[3];
        uniform float time, motion, gain, selected, locked;
        uniform vec2 bounds;
        varying vec4 vTrace;
        void main() {
          int group = int(vTrace.z + .5);
          vec3 tint = group == 3 ? colors[1] : colors[group];
          float chosen = abs(vTrace.z - selected) < .1 ? 1.0 : 0.0;
          float emphasis = group == 3 ? .86 : mix(.74 + .26 * chosen, .35 + .65 * chosen, locked);
          float profile = .83 * exp(-18.0 * vTrace.x * vTrace.x) + .14 * exp(-3.0 * vTrace.x * vTrace.x);
          float ends = smoothstep(bounds.x, bounds.x + 20.0, vTrace.y) * (1.0 - smoothstep(bounds.y - 24.0, bounds.y, vTrace.y));
          float flow = 1.0 + motion * .06 * sin(vTrace.y * .055 - time * 1.3);
          gl_FragColor = vec4(tint * 1.22, profile * emphasis * gain * ends * vTrace.w * flow);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(orbitTraceGeometry(path), material);
    this.mesh.name = 'Astral Route Traces';
    this.mesh.visible = false;
  }

  update(station: number, time: number, side: RouteSide | null, committed: boolean,
    width: number, height: number, dynamic: number) {
    const { path, mesh } = this;
    const gain = ease((station - (path.guideStart - 65)) / 55) * ease((path.end + 90 - station) / 65);
    mesh.visible = gain > .001;
    this.phase = !mesh.visible ? 'hidden' : station < path.guideStart ? 'approach'
      : !committed && station < path.split ? 'choice' : station < path.merge ? 'branch' : station < path.end ? 'merge' : 'exit';
    const uniforms = mesh.material.uniforms;
    uniforms.gain.value = gain;
    uniforms.time.value = time;
    uniforms.motion.value = THREE.MathUtils.clamp(dynamic, 0, 1);
    uniforms.selected.value = side ? routeSides.indexOf(side) : -1;
    uniforms.locked.value = committed ? ease((station - path.split) / 35) : 0;
    uniforms.viewport.value.set(width, height);
  }

  metrics() {
    const uniforms = this.mesh.material.uniforms;
    return { visible: this.mesh.visible, phase: this.phase, gain: uniforms.gain.value as number,
      selected: uniforms.selected.value as number, locked: uniforms.locked.value as number, motion: uniforms.motion.value as number,
      layout: this.layout, colors: this.colors.map(color => `#${color.getHexString()}`),
      vertices: this.mesh.geometry.getAttribute('position').count };
  }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
