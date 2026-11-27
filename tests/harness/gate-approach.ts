import type { Diagnostics, Difficulty, QualityTier, VolumeId } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { GateKind } from '../../app/game/core/volumes';
import { volumeById } from '../../app/game/core/volumes';
import { Graphics } from '../../app/game/graphics/scene.client';

const flags: Diagnostics = {
  fixedTime: null, autoplay: false, god: false, align: true, boost: false,
  mobileQuality: false, post: true, record: false, debug: false,
};
const distances = [211, 208, 195, 180, 160, 140, 120, 100, 85, 75, 65, 55, 45, 32, 20, 9, 5];

export function inspectGateApproach(id: VolumeId, kind: GateKind, quality: QualityTier = 'high', capture = false, boost = false,
  keepOtherGates = false, difficulty: Difficulty = 'normal') {
  const sim = new Simulation(volumeById(id), { align: true });
  sim.start(difficulty, 0);
  const samplesAhead = id === 'descent' ? [451, 445, 405, 350, 280, ...distances] : distances;
  const straightLength = keepOtherGates ? 140 : samplesAhead[0];
  const gate = sim.mainGates.find((gate, index) => {
    if (difficulty === 'impossible' && !gate.inserted) return false;
    if (keepOtherGates && (gate.beat < 180 || gate.routeStation - sim.mainGates[index - 2].routeStation > 75)) return false;
    if (gate.kind !== kind || gate.routeStation - sim.distance <= straightLength) return false;
    const at = sim.path.sample(gate.worldStation);
    const away = sim.path.sample(gate.worldStation - straightLength);
    return at.p.distanceTo(away.p.clone().addScaledVector(away.f, straightLength)) < .001;
  });
  if (!gate) throw new Error(`No straight approach for ${id} ${kind}`);

  const canvas = document.createElement('canvas');
  const graphics = new Graphics(canvas, quality, false, flags);
  graphics.resize(960, 540, 1);
  graphics.load(sim.volume, sim.path, sim.mode);
  graphics.prepare();
  const { gl } = graphics;
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const box = 256;
  const pixels = new Uint8Array(box * box * 4), background = new Uint8Array(pixels.length);
  const read = (buffer: Uint8Array) => gl.readPixels((width - box) / 2, (height - box) / 2, box, box, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
  const images: Record<number, string> = {};
  try {
    const samples = (keepOtherGates ? [140, 100, 85, 55, 32, 9] : samplesAhead).map(ahead => {
      while (sim.distance < gate.routeStation - ahead && sim.phase === 'playing') sim.step(STEP, { ...idleInput, boosting: boost });
      const queued = sim.previewGates.includes(gate) && ahead <= sim.gateLoadAhead;
      const previous = { distance: sim.distance, previews: sim.previewGates, camera: { ...sim.camera } };
      sim.distance = gate.routeStation - ahead;
      Object.assign(sim.camera, { x: 0, y: 0, roll: 0 });
      if (!keepOtherGates) sim.previewGates = queued ? [gate] : [];
      graphics.draw(sim, true);
      const visuals = Reflect.get(Reflect.get(graphics, 'volume'), 'visuals');
      const visual = visuals.get(gate);
      const inFront = sim.previewGates.filter(other => other.routeStation >= sim.distance && other.routeStation < gate.routeStation
        && visuals.get(other)?.meshes[0].visible).length;
      const fade = Number(visual?.mat.uniforms.uFade.value ?? 0);
      const visible = Boolean(visual?.meshes[0].visible);
      read(pixels);
      if (capture && [405, 350, 160, 100, 75, 55, 32, 9, 5].includes(ahead)) images[ahead] = canvas.toDataURL();
      // Suppress only the target draw and keep scenery, other gates and post focus identical.
      const meshes = visual?.meshes ?? [];
      for (const mesh of meshes) mesh.visible = false;
      graphics.draw(sim, true, false);
      read(background);
      const rgb = (data: Uint8Array, i: number) => .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      let peak = 0, contrastPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const contrast = Math.abs(rgb(pixels, i) - rgb(background, i));
        peak = Math.max(peak, contrast);
        if (contrast >= 20) contrastPixels++;
      }
      sim.distance = previous.distance;
      sim.previewGates = previous.previews;
      Object.assign(sim.camera, previous.camera);
      return { ahead, queued, created: !!visual, visible, fade, inFront, peak: Math.round(peak), contrastPixels };
    });
    return { id, kind, beat: gate.beat, samples, images, glError: gl.getError() };
  } finally {
    graphics.dispose();
  }
}
