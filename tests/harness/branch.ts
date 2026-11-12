import * as THREE from 'three';
import { branchLayout, BRANCH_PREVIEW_BEAT } from '../../app/game/core/branches';
import type { RouteSide } from '../../app/game/core/branches';
import type { Diagnostics, PlayMode } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import type { BranchVisual } from '../../app/game/graphics/branch.client';
import type { GateVisual } from '../../app/game/graphics/gates.client';
import type { RouteHologram } from '../../app/game/graphics/route-hologram.client';
import { Graphics } from '../../app/game/graphics/scene.client';
import type { Tunnel } from '../../app/game/graphics/tunnel.client';

export function inspectHologram() {
  return ([[960, 540, true], [360, 800, false]] as const).map(([width, height, post]) => {
    const volume = volumeById('elsewhere');
    const diagnostics: Diagnostics = { fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post, record: false, debug: false, branchSide: 'right' };
    const graphics = new Graphics(document.createElement('canvas'), 'high', false, diagnostics);
    const sim = new Simulation(volume, diagnostics);
    graphics.resize(width, height, 1);
    graphics.load(volume);
    graphics.prepare();
    const { hologram } = Reflect.get(graphics, 'volume') as { hologram: RouteHologram };
    const labels = Reflect.get(hologram, 'labels') as Record<string, THREE.BufferGeometry>;
    let released = 0;
    for (const geo of Object.values(labels)) geo.addEventListener('dispose', () => released++);
    for (const root of hologram.scene.children) (root.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => released++);
    const { gl } = graphics;
    const read = () => {
      const rows = Math.ceil(gl.drawingBufferHeight * 0.46);
      const buffer = new Uint8Array(gl.drawingBufferWidth * rows * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, rows, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      return buffer;
    };
    sim.start('normal', 0);
    try {
      const frames = [313.8, 318, 322.4, 323.2].map(beat => {
        while (sim.trackDistance < sim.reference.station(beat, sim.mode) && sim.phase === 'playing') {
          sim.step(STEP, { ...idleInput, boosting: true });
        }
        graphics.draw(sim, true);
        const visible = sim.routeGuide ? hologram.scene.children : [];
        const words = visible.map(root => Object.keys(labels).find(key => labels[key] === (root.children[1] as THREE.Mesh).geometry));
        const bounds = visible.flatMap(root => root.children.map(object => {
          const mesh = object as THREE.Mesh;
          mesh.geometry.computeBoundingBox();
          const { min, max } = mesh.geometry.boundingBox!;
          const corners = [min.x, max.x].flatMap(x => [min.y, max.y].flatMap(y => [min.z, max.z].map(z =>
            new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld).project(hologram.camera))));
          return { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
            minY: Math.min(...corners.map(p => p.y)), maxY: Math.max(...corners.map(p => p.y)), thickness: max.z - min.z,
            up: new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld).y };
        }));
        let pixels = 0;
        let movingPixels = 0;
        let stablePixels = 0;
        if (beat === 322.4) {
          const on = read();
          const render = hologram.render;
          try {
            hologram.render = (renderer, layout, selected, locked, time) =>
              render.call(hologram, renderer, layout, selected, locked, time + 0.47);
            graphics.draw(sim, true);
            const shifted = read();
            hologram.render = () => {};
            graphics.draw(sim, true);
            const off = read();
            const difference = (a: Uint8Array, b: Uint8Array, i: number) =>
              Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
            for (let i = 0; i < on.length; i += 4) {
              const visible = difference(on, off, i) > 32;
              const moved = difference(on, shifted, i);
              if (visible) pixels++;
              if (moved > 32 && (visible || difference(shifted, off, i) > 32)) movingPixels++;
              if (visible && moved < 4) stablePixels++;
            }
          } finally { hologram.render = render; }
        }
        return { holograms: visible.length, labels: words, bounds, selected: sim.routeSide,
          gatesJudged: sim.gatesJudged, pixels, movingPixels, stablePixels };
      });
      const glError = gl.getError();
      graphics.releaseSurface();
      return { frames, glError, released };
    } finally { graphics.dispose(); }
  });
}

export function inspectJunction(mode: PlayMode = 'standard') {
  const volume = volumeById('elsewhere');
  const diagnostics: Diagnostics = { fixedTime: null, autoplay: false, god: false, align: true, boost: false,
    mobileQuality: false, post: true, record: false, debug: false };
  const graphics = new Graphics(document.createElement('canvas'), 'low', false, diagnostics);
  const sim = new Simulation(volume, diagnostics);
  graphics.resize(960, 540, 1);
  graphics.load(volume);
  graphics.prepare();
  const scene = Reflect.get(graphics, 'volume') as {
    scene: THREE.Scene;
    tunnel: Tunnel;
    junction?: BranchVisual;
    visuals: Map<RunGate, GateVisual>;
  };
  const samples = [];
  const resets = [];
  let disposals = 0;
  let textureDisposals = 0;
  let materialDisposals = 0;
  try {
    const profiles = [[0, false, 'left'], [1, false, 'right'], [0, true, 'right']] as const;
    for (const [seed, boost, side] of [...profiles, ...profiles, ...profiles]) {
      diagnostics.branchSide = side;
      sim.start('normal', seed, undefined, mode);
      const advance = (beat: number) => {
        while (sim.trackDistance + 1e-8 < sim.reference.station(beat, mode) && sim.phase === 'playing') {
          sim.step(STEP, { ...idleInput, boosting: boost });
        }
      };
      advance(BRANCH_PREVIEW_BEAT - (mode === 'sightseeing' ? 24 : 9));
      graphics.warmSurface(sim, true);
      const before = graphics.metrics();
      advance(BRANCH_PREVIEW_BEAT);
      const begin = performance.now();
      graphics.draw(sim, true);
      const setupMs = performance.now() - begin;
      const junction = scene.junction!;
      for (const mesh of junction.group.children as THREE.Mesh[]) {
        mesh.geometry.addEventListener('dispose', () => disposals++);
        if (mesh.material !== scene.tunnel.junctionShell && mesh.material instanceof THREE.MeshBasicMaterial) {
          mesh.material.addEventListener('dispose', () => materialDisposals++);
          mesh.material.map?.addEventListener('dispose', () => textureDisposals++);
        }
      }
      const previewBeforeChoice = [];
      for (const beat of [317.5, 318.5, 319.5, 319.9]) {
        advance(beat);
        graphics.draw(sim, true);
        const camera = graphics.camera!;
        const signs = junction.group.children.filter(child => child.name.startsWith('junction-sign'));
        const opaque = [...scene.tunnel.chunks.flatMap(chunk => chunk.meshes),
          scene.scene.getObjectByName('junction-shell')!];
        const visible = signs.filter(sign => {
          const v = sign.position.clone().project(camera);
          const direction = sign.position.clone().sub(camera.position);
          const ray = new THREE.Raycaster(camera.position, direction.clone().normalize(), 0, direction.length() - 0.1);
          return Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > -1 && v.z < 1
            && ray.intersectObjects(opaque, false).length === 0;
        }).map(sign => sign.name);
        previewBeforeChoice.push({ beat: sim.beat, visible });
      }
      advance(327);
      graphics.draw(sim, true);
      const during = graphics.metrics();
      const activeSide = sim.branch?.side!;
      const gateErrors = [];
      const activeGates = [];
      for (const [gate, visual] of scene.visuals) {
        if (!gate.route || !visual.meshes[0].visible) continue;
        activeGates.push(gate.route);
        const pos = junction.path.sample(gate.worldStation, activeSide).p;
        gateErrors.push(pos.distanceTo(visual.meshes[0].position));
      }
      advance(mode === 'sightseeing' ? 375 : 361);
      graphics.draw(sim, true);
      const after = graphics.metrics();
      const names = ['left', 'center', 'right'].map(side => `junction-sign:${side}:${branchLayout(seed)[side as RouteSide]}`);
      samples.push({ seed, boost, names, setupMs, previewBeforeChoice, activeGates, gateErrors,
        route: sim.route, before, during, after, released: !junction.group.parent, glError: graphics.gl.getError() });
      sim.returnToMenu();
      graphics.draw(sim, true);
      const { geometries, programs, textures, junctionMeshes } = graphics.metrics();
      resets.push({ geometries, programs, textures, junctionMeshes });
    }
  return { samples, resets, disposals, textureDisposals, materialDisposals };
  } finally {
    graphics.dispose();
  }
}
