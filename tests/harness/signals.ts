import * as THREE from 'three';
import { createBuffers, createMaster, Synthesizer } from '../../app/game/audio/synthesizer.client';
import { canPass, lanePoint, opening } from '../../app/game/core/collision';
import type { Axis, Point } from '../../app/game/core/collision';
import { volumeById } from '../../app/game/core/volumes';
import type { GateKind } from '../../app/game/core/volumes';
import type { VolumeId } from '../../app/game/contracts';
import { GateGeometries, GateVisual } from '../../app/game/graphics/gates.client';

export function shaderMismatches(id: VolumeId) {
  const { obstacle } = volumeById(id);
  const renderer = new THREE.WebGLRenderer();
  const target = new THREE.WebGLRenderTarget(3, 3);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.001, 0.001, 0.001, -0.001, 0.1, 30);
  const geometries = new GateGeometries();
  const pixel = new Uint8Array(4);
  const mismatches: { kind: GateKind; axis: Axis; open: number; x: number; y: number }[] = [];
  function check(kind: GateKind, open: number, axis: Axis, points: Point[]) {
    const gate = new GateVisual(geometries, kind, open, axis);
    scene.add(gate.meshes[0]);
    for (const [x, y] of points) {
      if (Math.abs(x) > 3.4 || Math.abs(y) > 2.6 || Math.abs(x) + Math.abs(y) > 4.85) continue;
      camera.position.set(x, y, 3);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 1, 1, 1, 1, pixel);
      // No MSAA or post-processing in this target. Any colour is a glass fragment.
      const visible = pixel[0] + pixel[1] + pixel[2] > 0;
      if (visible === canPass(kind, open, axis, x, y)) mismatches.push({ kind, axis, open, x, y });
    }
    scene.remove(gate.meshes[0]);
    gate.dispose();
  }
  for (const axis of [0, 1] as const) {
    for (let sector = 0; sector < 9; sector++) {
      const open = opening(obstacle, sector);
      const [cx, cy] = lanePoint(obstacle, open, axis);
      const points: Point[] = [[0, 0], [cx, cy], [1, 0], [1.05, 0], [0.95, 0], [1.25, 0],
        [1.27, 0], [-1.27, 0], [0, 1], [0, -1], [0, 2], [0, -2], [cx + 0.94, cy], [cx + 0.96, cy]];
      if (obstacle === 'iris' && sector < 8) {
        const angle = sector * Math.PI / 4;
        for (const offset of [-0.396, -0.389, 0.389, 0.396]) {
          points.push([2 * Math.cos(angle + offset), 2 * Math.sin(angle + offset)]);
        }
        for (const radius of [1.015, 1.0195, 1.0205, 1.025]) {
          for (const offset of [-0.21, 0, 0.21]) {
            points.push([radius * Math.cos(angle + offset), radius * Math.sin(angle + offset)]);
          }
        }
      }
      check(obstacle, open, axis, points);
    }
  }
  if (id === 'elsewhere') {
    const square: Point[] = [[0, 0]];
    const diamond: Point[] = [[0, 0]];
    for (const sign of [-1, 1]) {
      for (const edge of [1.344, 1.347, 1.353, 1.356]) {
        square.push([sign * edge, 0.4], [0.4, sign * edge]);
      }
      for (const tip of [1.904, 1.907, 1.913, 1.916]) {
        diamond.push([sign * tip, 0], [0, sign * tip]);
      }
      for (const otherSign of [-1, 1]) {
        for (const edge of [0.950, 0.953, 0.957, 0.960]) {
          diamond.push([sign * edge, otherSign * edge]);
        }
      }
    }
    check('square', 0, 0, square);
    check('diamond', 0, 0, diamond);
  }
  const glError = renderer.getContext().getError();
  renderer.setRenderTarget(null);
  target.dispose();
  geometries.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return { mismatches, glError };
}

export function signal(buffer: AudioBuffer, from: number, to: number) {
  let squares = 0, peak = 0, count = 0, nonFinite = 0, clipped = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let index = Math.floor(from * buffer.sampleRate); index < Math.min(samples.length, to * buffer.sampleRate); index++) {
      const value = samples[index];
      if (!Number.isFinite(value)) { nonFinite++; continue; }
      if (Math.abs(value) >= 1) clipped++;
      squares += value ** 2;
      peak = Math.max(peak, Math.abs(value));
      count++;
    }
  }
  return { rms: Math.sqrt(squares / count), peak, nonFinite, clipped };
}

export async function sectionSignals(id: VolumeId) {
  const volume = volumeById(id);
  const lead = 0.12;
  const beatSeconds = 60 / volume.bpm;
  const duration = 8 * beatSeconds;
  const rate = 16_000;
  const levels = [];
  let beat = 0;
  for (const section of volume.sections) {
    const context = new OfflineAudioContext(2, Math.ceil((lead + duration) * rate), rate);
    const synth = new Synthesizer(context, volume, createMaster(context, 1), createBuffers(context));
    for (let offset = 0; offset < 32; offset++) {
      synth.playStep(beat * 4 + offset, lead + offset * beatSeconds / 4);
    }
    const buffer = await context.startRendering();
    levels.push({ section: section.name, ...signal(buffer, lead, lead + duration) });
    beat += section.beats;
  }
  return levels;
}

export async function stoppedRunSignal() {
  const context = new OfflineAudioContext(2, 48_000, 16_000);
  const volume = volumeById('elsewhere');
  const master = createMaster(context, 0.8);
  const buffers = createBuffers(context);
  const old = new Synthesizer(context, volume, master, buffers);
  for (let step = 0; step < 16; step++) old.playStep(192 + step, 0.12 + step * 0.1);
  const stop = context.suspend(0.5).then(async () => {
    old.dispose();
    const next = new Synthesizer(context, volume, master, buffers);
    for (let step = 0; step < 8; step++) next.playStep(192 + step, 2 + step * 0.1);
    await context.resume();
  });
  const [buffer] = await Promise.all([context.startRendering(), stop]);
  return [signal(buffer, 0.12, 0.45), signal(buffer, 0.65, 1.95), signal(buffer, 2.05, 2.85)];
}
