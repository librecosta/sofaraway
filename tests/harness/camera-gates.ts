import { VOLUMES } from '../../app/game/core/volumes';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import type { RunGate } from '../../app/game/core/simulation';
import type { PlayMode } from '../../app/game/contracts';
import type { BranchVisual } from '../../app/game/graphics/branch.client';
import type { GateVisual } from '../../app/game/graphics/gates.client';
import type { Path } from '../../app/game/graphics/path';
import { Graphics } from '../../app/game/graphics/scene.client';
import { REJOIN_BEAT, SPLIT_BEAT } from '../../app/game/core/branches';

export function inspectCameraAndGates() {
  const flags = { fixedTime: null, autoplay: false, god: false, align: true, boost: false,
    mobileQuality: false, post: false, record: false, debug: false, branchSide: 'right' } as const;
  const graphics = new Graphics(document.createElement('canvas'), 'low', false, flags);
  const modes: PlayMode[] = ['standard', 'sightseeing'];
  const round = (n: number) => Number(n.toFixed(4));
  try {
    graphics.load(VOLUMES[0]);
    const lens = modes.flatMap(mode => [20, 60, 120, 144].map(hz => {
      const sim = new Simulation(VOLUMES[0], flags);
      sim.start('normal', 0, undefined, mode);
      const clock = new FixedStepClock();
      const frames: { time: number; fov: number }[] = [];
      for (let i = 0; i <= hz * 6; i++) {
        clock.consume(i / hz, () => sim.step(STEP, { ...idleInput,
          boosting: clock.elapsed > 2 && clock.elapsed <= 4 }));
        graphics.update(sim, true);
        frames.push({ time: clock.elapsed, fov: graphics.camera!.fov });
      }
      const change = (start: number, end: number) => Math.max(...frames.slice(1).map(({ time, fov }, i) =>
        time > start && time <= end ? Math.abs(fov - frames[i].fov) : 0));
      return { mode, hz, beats: change(0, 2), entering: change(2, 3), leaving: change(4, 5),
        samples: [0, 0.25, 0.5, 1, 2, 2.25, 2.5, 3, 4, 4.25, 4.5, 5, 6]
          .map(t => ({ t, fov: round(frames.find(frame => frame.time === t)!.fov) })) };
    }));

    const spatial = [];
    for (const volume of VOLUMES) {
      graphics.load(volume);
      const scene = Reflect.get(graphics, 'volume') as { visuals: Map<RunGate, GateVisual>; path: Path; junction?: BranchVisual };
      for (const mode of modes) {
        const stages = volume.id === 'elsewhere'
          ? [['normal', 96], ['before', 304], ['entry', 316.5], ['branch', 328], ['merge', 349.5], ['after', 356]] as const
          : [['normal', 56]] as const;
        for (const [stage, start] of stages) {
          const sim = new Simulation(volume, flags);
          sim.start('normal', 0, undefined, mode);
          while (sim.beat < start && sim.phase === 'playing') sim.step(STEP, idleInput);
          const hasOrdinaryGate = () => sim.previewGates.some(gate => gate.beat > sim.beat + 3 && gate.beat < sim.beat + 12);
          if (stage === 'normal') {
            while (!hasOrdinaryGate() && sim.phase === 'playing') sim.step(STEP, idleInput);
          }
          graphics.update(sim, true);
          const route = stage === 'entry' || stage === 'branch' ? sim.branch?.layout.right : undefined;
          const gate = [...scene.visuals.keys()].find(gate => gate.beat > sim.beat + 3 && gate.beat < sim.beat + 12
            && gate.route === route);
          if (!gate) throw new Error(`No sampled gate: ${volume.id} ${mode} ${stage}`);
          const visual = scene.visuals.get(gate)!;
          const update = visual.update.bind(visual);
          let ahead = 0;
          visual.update = (time, hue, distance, beatsAway, hit) => {
            ahead = distance;
            return update(time, hue, distance, beatsAway, hit);
          };
          graphics.update(sim, true);
          const mesh = visual.meshes[0];
          let previous = mesh.position.clone();
          let previousAlong = sim.trackDistance + ahead;
          const visible = mesh.visible;
          const peak = { idle: 0, press: 0, release: 0 };
          const travel = { idle: 0, press: 0, release: 0 };
          let maxPathError = 0;
          let maxAheadIncrease = 0;
          const cameraSeams = [];
          let crossingError = 0;
          let previousAhead = ahead;
          let cameraPosition = graphics.camera!.position.clone();
          let cameraRotation = graphics.camera!.quaternion.clone();
          for (let tick = 0; !gate.judged && tick < 600; tick++) {
            const part = tick < 12 ? 'idle' : tick < 42 ? 'press' : 'release';
            const previousBeat = sim.beat;
            sim.step(STEP, { ...idleInput, boosting: part === 'press' });
            graphics.update(sim, true);
            const camera = graphics.camera!;
            for (const seam of [SPLIT_BEAT, REJOIN_BEAT]) {
              if (previousBeat < seam && sim.beat >= seam) {
                cameraSeams.push({ beat: seam, step: cameraPosition.distanceTo(camera.position),
                  turn: cameraRotation.angleTo(camera.quaternion) * 180 / Math.PI });
              }
            }
            cameraPosition = camera.position.clone();
            cameraRotation = camera.quaternion.clone();
            if (!mesh.visible) continue;
            const along = sim.trackDistance + ahead;
            const junction = scene.junction;
            const p = gate.route && junction ? junction.path.sample(along, 'right').p : scene.path.sample(along).p;
            maxPathError = Math.max(maxPathError, mesh.position.distanceTo(p));
            peak[part] = Math.max(peak[part], previous.distanceTo(mesh.position));
            travel[part] += Math.abs(along - previousAlong);
            maxAheadIncrease = Math.max(maxAheadIncrease, ahead - previousAhead);
            if (gate.judged) {
              const k = (gate.beat - previousBeat) / (sim.beat - previousBeat);
              crossingError = Math.abs(ahead + (sim.trackDistance - (previousAlong - previousAhead)) * (1 - k));
            }
            previous.copy(mesh.position);
            previousAlong = along;
            previousAhead = ahead;
          }
          const crossed = mesh.position.clone();
          let fadeDrift = 0;
          let fadeFrames = 0;
          for (let tick = 0; tick < 4; tick++) {
            sim.step(STEP, { ...idleInput, boosting: true });
            graphics.update(sim, true);
            if (mesh.visible) {
              fadeFrames++;
              fadeDrift = Math.max(fadeDrift, crossed.distanceTo(mesh.position));
            }
          }
          spatial.push({ volume: volume.id, mode, stage, gate: gate.beat, visible, judged: gate.judged,
            peak, travel, maxPathError, maxAheadIncrease, crossingError, fadeDrift, fadeFrames, cameraSeams });
        }
      }
    }
    const drift = VOLUMES[1];
    graphics.load(drift);
    const scene = Reflect.get(graphics, 'volume') as { visuals: Map<RunGate, GateVisual>; path: Path };
    const runToGate = (mode: PlayMode, boosting: boolean) => {
      const sim = new Simulation(drift, flags);
      sim.start('normal', 0, undefined, mode);
      while (sim.beat < 56) sim.step(STEP, idleInput);
      const gate = sim.previewGates.find(gate => gate.beat === (mode === 'standard' ? 64 : 70))!;
      while (!gate.judged) {
        const before = sim.trackDistance;
        const beat = sim.beat;
        const passed = sim.gatesPassed;
        sim.step(STEP, { ...idleInput, boosting });
        if (gate.judged) {
          const along = before + (sim.trackDistance - before) * (gate.beat - beat) / (sim.beat - beat);
          graphics.update(sim, true);
          const mesh = scene.visuals.get(gate)!.meshes[0];
          return { beat: gate.beat, along, visible: mesh.visible, passed: sim.gatesPassed === passed + 1,
            contactError: mesh.position.distanceTo(scene.path.sample(along).p) };
        }
      }
      throw new Error('Gate already judged');
    };
    return { lens, spatial, heldBoost: modes.map(mode =>
      ({ mode, cruise: runToGate(mode, false), boosted: runToGate(mode, true) })) };
  } finally {
    graphics.dispose();
  }
}
