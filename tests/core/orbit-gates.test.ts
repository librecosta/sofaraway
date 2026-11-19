import { expect, test } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { canPass, lanePoint } from '../../app/game/core/collision';
import { apertureAnchors, apertureContour, apertureSizes, orbitClearanceAt, orbitGateKinds, orbitPresets } from '../../app/game/core/orbit-gates';
import { SECTION } from '../../app/game/core/section';
import { GateGeometries } from '../../app/game/graphics/gates.client';
import { GLASS_THICKNESS } from '../../app/game/graphics/glass-geometry';

test('all 24 fixed aperture presets leave material around every hole and between neighbors', () => {
  expect(orbitGateKinds.map(kind => orbitPresets[kind].length)).toEqual([12, 6, 6]);
  const anchors = new Set<string>(), shapes = new Set<string>(), sizes = new Set<string>();
  for (const kind of orbitGateKinds) for (const [open, preset] of orbitPresets[kind].entries()) {
    expect(preset.holes.length).toBe(orbitGateKinds.indexOf(kind) + 1);
    for (const hole of preset.holes) {
      anchors.add(hole.anchor); shapes.add(hole.shape); sizes.add(hole.size);
      const [x, y] = apertureAnchors[hole.anchor];
      expect(canPass(kind, open, 0, x, y)).toBe(true);
      for (const [x, y] of apertureContour(hole, .035)) {
        expect(Math.abs(x)).toBeLessThan(SECTION.a - .15);
        expect(Math.abs(y)).toBeLessThan(SECTION.b - .15);
        expect(Math.abs(x) + Math.abs(y)).toBeLessThan(SECTION.a + SECTION.b - SECTION.ch - .15);
        for (const other of preset.holes) if (hole !== other) {
          const [cx, cy] = apertureAnchors[other.anchor];
          const r = apertureSizes[other.shape][other.size];
          const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
          const inside = other.shape === 'circle' ? Math.hypot(dx, dy) < r + .06
            : other.shape === 'square' ? Math.max(dx, dy) < r + .06 : dx + dy < r + .08;
          expect(inside).toBe(false);
        }
      }
    }
    expect(canPass(kind, open, 0, ...lanePoint(kind, open, 0))).toBe(true);
    expect(canPass(kind, open, 1, ...lanePoint(kind, open, 1))).toBe(true);
  }
  expect(anchors.size).toBe(9); expect(shapes.size).toBe(3); expect(sizes.size).toBe(3);
});

test('indexed beveled glass agrees with all analytical holes, including multiple openings and solid regions', () => {
  const geometries = new GateGeometries(), material = new MeshBasicMaterial({ side: DoubleSide });
  const ray = new Raycaster(), direction = new Vector3(0, 0, -1), a = new Vector3(), b = new Vector3(), c = new Vector3();
  try {
    for (const kind of orbitGateKinds) for (const [open, preset] of orbitPresets[kind].entries()) {
      const geometry = geometries.get(kind, open);
      expect(geometries.get(kind, open, 1)).toBe(geometry);
      const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.index!;
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < normal.count; i++) expect(new Vector3().fromBufferAttribute(normal, i).length()).toBeCloseTo(1, 5);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z).toBeCloseTo(GLASS_THICKNESS, 6);
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
        expect(b.sub(a).cross(c.sub(a)).lengthSq()).toBeGreaterThan(1e-12);
      }
      const mesh = new Mesh(geometry, material);
      const clear = (x: number, y: number) => { ray.set(new Vector3(x, y, 2), direction); return !ray.intersectObject(mesh).length; };
      for (const hole of preset.holes) expect(clear(...apertureAnchors[hole.anchor])).toBe(true);
      for (let x = -3.5; x <= 3.5; x += .19) for (let y = -2.7; y <= 2.7; y += .19) {
        if (Math.abs(x) + Math.abs(y) > 5.35 || Math.abs(orbitClearanceAt(kind, open, x, y)) < .005) continue;
        expect(clear(x, y), `${kind}:${open} at ${x},${y}`).toBe(canPass(kind, open, 0, x, y));
      }
    }
  } finally { material.dispose(); geometries.dispose(); }
});
