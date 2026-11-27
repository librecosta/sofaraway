import * as THREE from 'three';
import { createEffect } from './effects.client';
import { surfacePresets } from './presets';
import type { EffectMaterialId, SurfaceChannel, SurfaceMaterialId } from './presets';
import { generateSurface, MATERIAL_SEED } from './surface';

function tile(data: Uint8Array<ArrayBuffer>, size: number, color = false) {
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

interface Surface {
  material: THREE.MeshStandardMaterial;
  maps: THREE.DataTexture[];
  height?: Float32Array;
}

/** One instance per volume or preview renderer. Chunks borrow, never dispose. */
export class MaterialLibrary {
  private readonly surfaces = new Map<SurfaceMaterialId, Surface>();
  private readonly effects = new Map<EffectMaterialId, ReturnType<typeof createEffect>>();

  constructor(private readonly retainHeight = false) {}

  get(id: SurfaceMaterialId) {
    let entry = this.surfaces.get(id);
    if (!entry) {
      const data = generateSurface(id, MATERIAL_SEED);
      const preset = surfacePresets[id];
      const map = tile(data.color, data.size, true), normalMap = tile(data.normal, data.size);
      const roughnessMap = data.roughness ? tile(data.roughness, data.size) : null;
      const material = new THREE.MeshStandardMaterial({ name: id, map, normalMap, roughnessMap,
        metalness: preset.metalness, roughness: roughnessMap ? 1 : preset.roughness,
        side: THREE.DoubleSide, envMapIntensity: 1 });
      entry = { material, maps: roughnessMap ? [map, normalMap, roughnessMap] : [map, normalMap],
        height: this.retainHeight ? data.height : undefined };
      this.surfaces.set(id, entry);
    }
    return entry.material;
  }

  getEffect(id: EffectMaterialId) {
    let material = this.effects.get(id);
    if (!material) {
      material = createEffect(id);
      material.name = id;
      this.effects.set(id, material);
    }
    return material;
  }

  upload(renderer: THREE.WebGLRenderer) {
    for (const { maps } of this.surfaces.values()) for (const map of maps) renderer.initTexture(map);
  }

  inspect(id: SurfaceMaterialId, channel: SurfaceChannel) {
    const material = this.get(id);
    const size = surfacePresets[id].resolution;
    const source = this.surfaces.get(id)!;
    const map = channel === 'color' ? material.map : channel === 'normal' ? material.normalMap : material.roughnessMap;
    if (channel === 'height' ? !source.height : !map) return;
    const data = channel === 'height' ? undefined : (map as THREE.DataTexture).image.data as Uint8Array;
    let min = Infinity, max = -Infinity;
    if (channel === 'height') for (const h of source.height!) { min = Math.min(min, h); max = Math.max(max, h); }
    const image = new ImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const from = ((size - y - 1) * size + x), to = (y * size + x) * 4;
      if (data) {
        image.data[to] = data[from * 4]; image.data[to + 1] = data[from * 4 + 1]; image.data[to + 2] = data[from * 4 + 2];
      } else {
        const h = Math.round((source.height![from] - min) / Math.max(max - min, 1e-9) * 255);
        image.data[to] = image.data[to + 1] = image.data[to + 2] = h;
      }
      image.data[to + 3] = 255;
    }
    return image;
  }

  dispose() {
    for (const { material, maps } of this.surfaces.values()) {
      material.dispose();
      for (const map of maps) map.dispose();
    }
    for (const material of this.effects.values()) material.dispose();
    this.surfaces.clear();
    this.effects.clear();
  }
}
