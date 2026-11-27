import * as THREE from 'three';
import type { PickupKind } from '../core/pickups';

const colors = { shield: '#64d8ff', resonance: '#ff84e1', lumen: '#ffe680' } as const;

export class PickupVisual {
  readonly group = new THREE.Group();
  private readonly material: THREE.MeshBasicMaterial;
  private readonly meshes: THREE.Mesh[] = [];
  private cargoShell?: THREE.MeshStandardMaterial;

  constructor(readonly kind: PickupKind, private readonly cargo = false) {
    this.group.name = `pickup:${kind}`;
    this.material = new THREE.MeshBasicMaterial({
      color: colors[kind], transparent: !cargo, blending: cargo ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: cargo, toneMapped: false,
    });
    if (cargo) {
      this.buildCargo();
      return;
    }
    if (kind === 'shield') {
      this.add(new THREE.IcosahedronGeometry(0.35));
      const guard = this.add(new THREE.TorusGeometry(0.53, 0.045, 6, 28));
      guard.rotation.set(0.42, 0.42, 0);
    } else if (kind === 'resonance') {
      this.add(new THREE.TorusGeometry(0.55, 0.045, 6, 28));
      this.add(new THREE.TorusGeometry(0.33, 0.045, 6, 22));
      this.add(new THREE.SphereGeometry(0.13, 10, 8));
    } else {
      this.add(new THREE.OctahedronGeometry(0.43)).scale.set(0.84, 1.48, 0.84);
    }
  }

  private buildCargo() {
    const shell = this.cargoShell = new THREE.MeshStandardMaterial({
      color: 0x566772, roughness: .54, metalness: .46, emissive: 0x496372, emissiveIntensity: .36,
    });
    const drum = this.add(new THREE.CylinderGeometry(.57, .62, .75, 8), shell);
    drum.rotation.x = Math.PI / 2;
    for (const x of [-.48, .48]) {
      this.add(new THREE.BoxGeometry(.24, .78, .87), shell).position.x = x;
      this.add(new THREE.BoxGeometry(.10, .55, .04)).position.set(x, 0, .459);
    }
    if (this.kind === 'shield') {
      this.add(new THREE.RingGeometry(.19, .31, 6)).position.z = .407;
    } else if (this.kind === 'resonance') {
      for (const x of [-.13, .13]) this.add(new THREE.BoxGeometry(.105, .43, .052)).position.set(x, 0, .415);
    } else {
      const mark = this.add(new THREE.PlaneGeometry(.36, .36));
      mark.position.z = .415;
      mark.rotation.z = Math.PI / 4;
    }
  }

  private add(geometry: THREE.BufferGeometry, material: THREE.Material = this.material) {
    const mesh = new THREE.Mesh(geometry, material);
    this.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  update(beat: number, distanceFraction: number) {
    if (this.cargo) return;
    this.material.opacity = 0.88 * (1 - THREE.MathUtils.smoothstep(distanceFraction, 0.75, 1));
    this.group.rotation.set(0, Math.sin(beat * 0.5) * 0.35, beat * 0.45);
  }

  dispose() {
    this.group.removeFromParent();
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
    this.cargoShell?.dispose();
  }
}
