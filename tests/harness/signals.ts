import * as THREE from 'three';
import { createBuffers, createMaster, Synthesizer } from '../../app/game/audio/synthesizer.client';
import { canPass, lanePoint, opening, WALL } from '../../app/game/core/collision';
import { volumeById } from '../../app/game/core/volumes';
import type { VolumeId } from '../../app/game/contracts';
import { GateVisual } from '../../app/game/graphics/gates.client';

export function shaderMismatches(id: VolumeId) {
  const { obstacle } = volumeById(id);
  const renderer = new THREE.WebGLRenderer();
  const target = new THREE.WebGLRenderTarget(3, 3);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-0.001, 0.001, 0.001, -0.001, 0.1, 30);
  const geometry = new THREE.PlaneGeometry(WALL.w, WALL.h);
  const pixel = new Uint8Array(4);
  const mismatches = [];
  for (const axis of [0, 1] as const) {
    for (let sector = 0; sector < 9; sector++) {
      const open = opening(obstacle, sector);
      const gate = new GateVisual(geometry, obstacle, open, axis);
      scene.add(gate.meshes[0]);
      const [cx, cy] = lanePoint(obstacle, open, axis);
      for (const [x, y] of [[0, 0], [cx, cy], [1, 0], [1.05, 0], [0.95, 0], [1.25, 0],
        [1.27, 0], [-1.27, 0], [0, 1], [0, -1], [0, 2], [0, -2], [cx + 0.94, cy], [cx + 0.96, cy]]) {
        if (Math.abs(x) > 3.4 || Math.abs(y) > 2.6 || Math.abs(x) + Math.abs(y) > 4.85) continue;
        camera.position.set(x, y, 3);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 1, 1, 1, 1, pixel);
        const visible = pixel[0] + pixel[1] + pixel[2] > 0;
        if (visible === canPass(obstacle, open, axis, x, y)) mismatches.push({ obstacle, axis, open, x, y });
      }
      scene.remove(gate.meshes[0]);
      gate.dispose();
    }
  }
  const glError = renderer.getContext().getError();
  renderer.setRenderTarget(null);
  target.dispose();
  geometry.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return { mismatches, glError };
}

function signal(buffer: AudioBuffer, from: number, to: number) {
  let squares = 0, peak = 0, count = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let index = Math.floor(from * buffer.sampleRate); index < Math.min(samples.length, to * buffer.sampleRate); index++) {
      squares += samples[index] ** 2;
      peak = Math.max(peak, Math.abs(samples[index]));
      count++;
    }
  }
  return { rms: Math.sqrt(squares / count), peak };
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
