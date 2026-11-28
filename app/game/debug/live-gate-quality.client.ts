import * as THREE from 'three';
import { gateCrossingQuality } from '../core/crossing-quality';
import type { RunGate } from '../core/run-chart';
import { SECTION } from '../core/section';
import type { GateVisual } from '../graphics/gates.client';

type Gate = Pick<RunGate, 'kind' | 'open' | 'axis' | 'judged'>;
type OverlayMaterial = THREE.MeshBasicMaterial & { map: THREE.DataTexture };
const columns = 300;
const rows = 236;

function zoneTexture(gate: Gate) {
  const data = new Uint8Array(columns * rows * 4);
  for (let row = 0; row < rows; row++) {
    const y = ((row + .5) / rows * 2 - 1) * SECTION.b;
    for (let column = 0; column < columns; column++) {
      const x = ((column + .5) / columns * 2 - 1) * SECTION.a;
      const quality = gateCrossingQuality(gate.kind, gate.open, gate.axis, x, y);
      if (quality !== 'precision' && quality !== 'nearMiss') continue;
      const offset = (row * columns + column) * 4;
      const precision = quality === 'precision';
      data[offset] = precision ? 116 : 255;
      data[offset + 1] = precision ? 255 : 189;
      data[offset + 2] = precision ? 220 : 112;
      data[offset + 3] = precision ? 105 : 145;
    }
  }
  const texture = new THREE.DataTexture(data, columns, rows);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class LiveGateQualityOverlay {
  private readonly planes = new Map<Gate, THREE.Mesh>();
  private readonly materials = new Map<string, OverlayMaterial>();
  private geometry?: THREE.PlaneGeometry;

  sync(visuals: ReadonlyMap<Gate, GateVisual>, flying: boolean) {
    for (const [gate, plane] of this.planes) {
      const face = visuals.get(gate)?.meshes[0];
      if (flying && !gate.judged && face?.visible && plane.parent === face) continue;
      plane.removeFromParent();
      this.planes.delete(gate);
    }
    if (!flying) return;
    for (const [gate, visual] of visuals) {
      const face = visual.meshes[0];
      if (gate.judged || !face.visible || this.planes.has(gate)) continue;
      const geometry = this.geometry ??= new THREE.PlaneGeometry(2 * SECTION.a, 2 * SECTION.b);
      const plane = new THREE.Mesh(geometry, this.material(gate));
      plane.name = 'live-gate-quality';
      plane.position.z = .01;
      plane.renderOrder = face.renderOrder + 1;
      face.add(plane);
      this.planes.set(gate, plane);
    }
  }

  private material(gate: Gate): OverlayMaterial {
    const key = `${gate.kind}:${gate.open}:${gate.axis}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, fog: false,
    });
    const zone = Object.assign(material, { map: zoneTexture(gate) });
    this.materials.set(key, zone);
    return zone;
  }

  reset() {
    for (const plane of this.planes.values()) plane.removeFromParent();
    this.planes.clear();
    for (const material of this.materials.values()) {
      material.map.dispose();
      material.dispose();
    }
    this.materials.clear();
    this.geometry?.dispose();
    this.geometry = undefined;
  }
}
