import { expect, test } from 'vitest';
import { Vector3 } from 'three';
import { routeSides } from '../../app/game/core/branches';
import { orbitRouteSwatches } from '../../app/game/core/orbit-routes';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { ORBIT_TRACE_DROP, OrbitRouteGuides } from '../../app/game/graphics/orbit-route-guides.client';

test('astral traces sample all real branch paths outside the gate hull and share one geometry', () => {
  for (const mode of ['standard', 'sightseeing'] as const) for (const difficulty of ['normal', 'impossible'] as const) for (const seed of [0, 1]) {
    const sim = new Simulation(volumeById('orbit'));
    sim.start(difficulty, seed, undefined, mode);
    const path = sim.junctionPath!, guides = new OrbitRouteGuides(path, sim.branch!.layout);
    const geometry = guides.mesh.geometry, position = geometry.getAttribute('position'), trace = geometry.getAttribute('trace');
    const point = new Vector3();
    for (let i = 0; i < position.count; i += 2) {
      const group = Math.round(trace.getZ(i)), station = trace.getY(i);
      const frame = path.sample(station, group === 3 ? 'center' : routeSides[group]);
      point.fromBufferAttribute(position, i).sub(frame.p);
      expect(point.dot(frame.u)).toBeCloseTo(-ORBIT_TRACE_DROP, 3);
      expect(Math.abs(point.dot(frame.r))).toBeLessThan(.002);
      expect(Math.abs(point.dot(frame.f))).toBeLessThan(.002);
      expect(point.fromBufferAttribute(position, i).distanceTo(new Vector3().fromBufferAttribute(position, i + 1))).toBe(0);
    }
    const checkpoints = [path.guideStart - 100, path.guideStart, path.split + 40, path.merge + 1, path.end + 30, path.end + 100];
    for (const [index, station] of checkpoints.entries()) {
      guides.update(station, 55, 'left', station >= path.split, 960, 540, 0);
      expect(guides.metrics().phase).toBe(['hidden', 'choice', 'branch', 'merge', 'exit', 'hidden'][index]);
      expect(guides.mesh.geometry).toBe(geometry);
      expect(guides.mesh.material.uniforms.motion.value).toBe(0);
    }
    expect(guides.metrics().colors).toEqual(routeSides.map(side => orbitRouteSwatches[sim.branch!.layout[side]].toLowerCase()));
    expect(guides.mesh.material.depthTest).toBe(true);
    let released = 0;
    geometry.addEventListener('dispose', () => released++);
    guides.mesh.material.addEventListener('dispose', () => released++);
    guides.dispose(); expect(released).toBe(2);
  }
});
