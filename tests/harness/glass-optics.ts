import * as THREE from 'three';
import { DIAMOND_EXTENT, HUB_R, SQUARE_HALF } from '../../app/game/core/collision';
import { GateGeometries, GateVisual } from '../../app/game/graphics/gates.client';

export function inspectGlassOptics() {
  const renderer = new THREE.WebGLRenderer();
  const target = new THREE.WebGLRenderTarget(3, 3);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 30);
  const scene = new THREE.Scene();
  const owner = new GateGeometries();
  const square = new GateVisual(owner, 'square', 0, 0);
  const diamond = new GateVisual(owner, 'diamond', 0, 0);
  const iris = new GateVisual(owner, 'iris', 0, 0);
  const gates = [square, diamond, iris];
  const pixel = new Uint8Array(4);
  const read = (gate: GateVisual, time: number) => {
    scene.add(gate.meshes[0]);
    gate.update(time, 0.48, 4, 1, false);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 1, 1, 1, 1, pixel);
    scene.remove(gate.meshes[0]);
    return pixel[0] + pixel[1] + pixel[2];
  };
  const sample = (gate: GateVisual, x: number, y: number, time = 0, width = 0.0015) => {
    camera.position.set(x, y, 3);
    camera.left = camera.bottom = -width * 1.5;
    camera.right = camera.top = width * 1.5;
    camera.updateProjectionMatrix();
    return read(gate, time);
  };
  const cast = (gate: GateVisual, x: number, y: number, z: number, dx: number, dy: number) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, dy, 0).normalize());
    return ray.intersectObject(gate.meshes[0], false)[0]?.distance ?? null;
  };
  let released = 0;
  for (const gate of gates) gate.meshes[0].geometry.addEventListener('dispose', () => released++);
  try {
    const rim = sample(square, SQUARE_HALF + 0.002, 0.7);
    const halo = sample(square, SQUARE_HALF + 0.055, 0.7);
    const seam = sample(square, 2.1, 2.1);
    const outer = sample(square, 3.748, 0.7);
    const body = sample(square, 2.2, 0.7);
    const hub = [0.15, 0.2 * Math.tan(Math.PI / 8), -0.2 * Math.tan(Math.PI / 8)].map(y =>
      sample(iris, 0.2, y) - sample(iris, 0.45, y));
    const microContrast = [0.0015, 0.08].map(width => {
      const values = Array.from({ length: 12 }, (_, i) => sample(square, 2.1, 0.68, i / (12 * 0.65), width));
      return Math.max(...values) - Math.min(...values);
    });
    const throatAndBevel = [0.19, 0.025].map(z => [
      cast(square, 0, 0, z, 1, 0),
      cast(diamond, 0, 0, z, 1, 1),
      cast(iris, 2, 0, z, -1, 0),
      cast(iris, 2, 0, z, 0, 1),
    ]);
    camera.up.set(0, 0, 1);
    camera.far = 1.3; // The expected throat is closer than 1; exclude opposite panes.
    camera.updateProjectionMatrix();
    const irisWalls = Array.from({ length: 8 }, (_, open) => {
      const gate = new GateVisual(owner, 'iris', open, 0);
      const angle = open * Math.PI / 4;
      const x = Math.cos(angle), y = Math.sin(angle);
      camera.position.set(2 * x, 2 * y, 0.19);
      try {
        return [[-x, -y], [-y, x], [y, -x]].map(([dx, dy]) => {
          camera.lookAt(2 * x + dx, 2 * y + dy, 0.19);
          return read(gate, 0);
        });
      } finally { gate.dispose(); }
    });
    const repeated = Array.from({ length: 24 }, (_, i) => new GateVisual(owner, i % 2 ? 'square' : 'diamond', 0, 0));
    const unique = new Set(repeated.map(gate => gate.meshes[0].geometry)).size;
    for (const gate of repeated) gate.dispose();
    const releasedByGate = released;
    owner.dispose();
    const glError = renderer.getContext().getError();
    return { rim, halo, seam, outer, body, hub, microContrast, throatAndBevel, irisWalls, unique, releasedByGate, released, glError,
      expectedThroat: [SQUARE_HALF, DIAMOND_EXTENT * Math.SQRT1_2, 2 - HUB_R, 2 * Math.tan(Math.PI / 8)] };
  } finally {
    for (const gate of gates) gate.dispose();
    owner.dispose();
    renderer.setRenderTarget(null);
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
