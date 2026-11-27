import * as THREE from 'three';
import { MaterialLibrary } from '../../app/game/graphics/materials/library.client';
import { surfaceIds, surfacePresets } from '../../app/game/graphics/materials/presets';
import type { SurfaceMaterialId } from '../../app/game/graphics/materials/presets';
import { buildPath } from '../../app/game/graphics/path';
import { makeHull } from '../../app/game/graphics/textures.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';

function shellBoundary(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>, station: number) {
  const { geometry, material } = mesh;
  const uv = geometry.getAttribute('uv'), p = geometry.getAttribute('position');
  return geometry.groups.map(group => {
    const id = material[group.materialIndex!].name as SurfaceMaterialId;
    const v = Math.fround(station / surfacePresets[id].tile[1]);
    const points = new Set<string>();
    for (let i = group.start; i < group.start + group.count; i++) {
      const j = geometry.index!.getX(i);
      if (Math.abs(v - uv.getY(j)) < 1e-5) points.add([p.getX(j), p.getY(j), p.getZ(j), uv.getX(j), uv.getY(j)].join(','));
    }
    return [...points].sort();
  });
}

export function inspectMaterials() {
  THREE.ColorManagement.enabled = false;
  const library = new MaterialLibrary();
  const tunnel = new Tunnel(library, buildPath(5000, 150, 46, 'conduit'), 'conduit');
  const chunks = [tunnel._buildChunk(4200, 4410), tunnel._buildChunk(4410, 4620)];
  const shells = chunks.map(chunk => chunk.meshes.find(mesh => mesh.name === 'tunnel-shell') as
    THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>);
  const boundary = shells.map(mesh => shellBoundary(mesh, 4410));
  const sameMaterials = shells[0].material.every((material, i) => material === shells[1].material[i]);
  const materialIds = tunnel.surfaceMaterials!.map(m => m.name);
  const maps = new Set(tunnel.surfaceMaterials!.flatMap(m => [m.map!, m.normalMap!, ...(m.roughnessMap ? [m.roughnessMap] : [])]));
  let disposed = 0;
  for (const texture of maps) texture.addEventListener('dispose', () => disposed++);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const target = new THREE.WebGLRenderTarget(1, 1);
  const map = library.get('alloy-satin-dark').map as THREE.DataTexture;
  map.magFilter = map.minFilter = THREE.NearestFilter;
  const material = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 4);
  camera.position.z = 2;
  const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(2, 2);
  // Sample a texel center to avoid ambiguity on the midpoint between texels.
  const uv = geometry.getAttribute('uv'), i = 128, size = map.image.width;
  for (let n = 0; n < uv.count; n++) uv.setXY(n, (i + .5) / size, (i + .5) / size);
  scene.add(new THREE.Mesh(geometry, material));
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixel = new Uint8Array(4);
  renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
  const offset = (i * size + i) * 4;
  const raw = Array.from(map.image.data!.slice(offset, offset + 3));
  const expected = raw.map(byte => {
    const s = byte / 255;
    return Math.round(255 * (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4));
  });
  const colorMetadata = [...maps].map(map => map.colorSpace);
  const roughness = library.get('alloy-brushed-tech').roughness;
  const glError = renderer.getContext().getError();
  renderer.setRenderTarget(null);
  target.dispose();
  material.dispose();
  geometry.dispose();
  for (const chunk of chunks) tunnel._disposeChunk(chunk);
  tunnel.dispose();
  const disposedWithTunnel = disposed;
  library.dispose();
  library.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  const generation = [0, 1, 2].map(() => {
    const before = performance.now();
    const old = makeHull();
    const legacyMs = performance.now() - before;
    const runtime = new MaterialLibrary();
    const start = performance.now();
    for (const id of surfaceIds) if (id !== 'utility-polymer') runtime.get(id);
    const runtimeMs = performance.now() - start;
    runtime.get('utility-polymer');
    const labMs = performance.now() - start;
    runtime.dispose();
    return { legacyMs, runtimeMs, labMs, legacySize: old.map.width };
  });
  return { boundary, sameMaterials, materialIds, textureCount: maps.size, disposedWithTunnel, disposed,
    raw, decoded: Array.from(pixel.slice(0, 3)), expected, colorMetadata, roughness, glError, generation };
}
