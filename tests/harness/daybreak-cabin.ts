import * as THREE from 'three';
import { SECTION } from '../../app/game/core/collision';
import { volumeById } from '../../app/game/core/volumes';
import { buildRunPath } from '../../app/game/graphics/path';
import { buildTextures } from '../../app/game/graphics/textures.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';

export function inspectDaybreakCabin() {
  const volume = volumeById('daybreak');
  const path = buildRunPath(volume);
  const textures = buildTextures();
  const tunnel = new Tunnel(textures, path, volume.topology);
  let materialsDisposed = 0;
  let measurement;
  try {
    // Station 210 falls inside the first bend and is also a streaming boundary.
    tunnel.update(0);
    tunnel.update(211);
    const two = tunnel.chunks.slice(0, 2);
    const [left, right] = two.map(chunk => chunk.meshes.find(mesh => mesh.name === 'canal-skyglass')!);
    const positions = (mesh: THREE.Mesh) => mesh.geometry.getAttribute('position');
    const from = positions(left), to = positions(right);
    let seamError = 0;
    const nv = 5 * 4;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
      const a = new THREE.Vector3().fromBufferAttribute(from, from.count - nv + i * 4 + j + 2);
      const b = new THREE.Vector3().fromBufferAttribute(to, i * 4 + j);
      seamError = Math.max(seamError, a.distanceTo(b));
    }
    const rays = [-1, 1].flatMap(sign => [[3.75 * sign, 1.0], [3.35 * sign, 2.15], [3.75 * sign, .547]]);
    rays.push([0, SECTION.b], [0, -SECTION.b]);
    const misses: number[][] = [];
    const ray = new THREE.Raycaster();
    const hull = two.flatMap(chunk => chunk.meshes.filter(mesh =>
      ['canal-skyglass', 'tunnel-shell', 'tunnel-ribs'].includes(mesh.name)));
    for (const station of [151.25, 207.5, 209.99, 210, 210.01, 211.2, 223.2]) {
      const { p, r, u } = path.sample(station);
      for (const [x, y] of rays) {
        ray.set(p, r.clone().multiplyScalar(x).addScaledVector(u, y).normalize());
        if (!ray.intersectObjects(hull).length) misses.push([station, x, y]);
      }
    }
    const mat = left.material as THREE.Material;
    const shared = mat === right.material;
    let geometriesDisposed = 0;
    for (const mesh of [left, right]) mesh.geometry.addEventListener('dispose', () => geometriesDisposed++);
    mat.addEventListener('dispose', () => materialsDisposed++);
    tunnel.update(1250);
    const streamed = { geometriesDisposed, materialsDisposed };
    measurement = { seamError, misses, shared, depthTest: mat.depthTest, depthWrite: mat.depthWrite,
      transparent: mat.transparent, doubleSide: mat.side === THREE.DoubleSide, streamed,
      liveCanopyMeshes: tunnel.chunks.filter(chunk => chunk.meshes.some(mesh => mesh.name === 'canal-skyglass')).length,
      chunks: tunnel.chunks.length };
  } finally {
    tunnel.dispose();
    for (const texture of Object.values(textures)) texture.dispose();
  }
  return { ...measurement, materialsDisposed };
}
