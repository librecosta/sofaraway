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
import { curveEndBeat, curveStartBeat } from '../../app/game/core/corridor-composition';

export function inspectCameraAndGates() {
  const flags = { fixedTime: null, autoplay: false, god: false, align: true, boost: false,
    mobileQuality: false, post: false, record: false, debug: false, branchSide: 'right' } as const;
  const graphics = new Graphics(document.createElement('canvas'), 'low', false, flags);
  const modes: PlayMode[] = ['standard', 'sightseeing'];
  const round = (n: number) => Number(n.toFixed(4));
  try {
    const lens = modes.flatMap(mode => [20, 60, 120, 144].map(hz => {
      const sim = new Simulation(VOLUMES[0], flags, undefined, mode);
      graphics.load(sim.volume, sim.path, mode);
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
      for (const mode of modes) {
        const run = new Simulation(volume, flags, undefined, mode);
        graphics.load(volume, run.path, mode);
        const scene = Reflect.get(graphics, 'volume') as { visuals: Map<RunGate, GateVisual>; path: Path; junction?: BranchVisual };
        const stages = volume.id === 'elsewhere'
          ? [['normal', 96], ['iris', 0], ['square', 0], ['diamond', 0],
            ['before', 304], ['entry', 317.5], ['branch', 328], ['merge', 349.5], ['after', 356]] as const
          : [['normal', 56]] as const;
        for (const [stage, start] of stages) {
          const sim = new Simulation(volume, flags, run.path, mode);
          sim.start('normal', 0, undefined, mode);
          const station = (beat: number) => sim.reference.station(beat, mode);
          const curveGate = start === 0 ? (Reflect.get(sim, 'chart') as RunGate[])
            .find(gate => gate.kind === stage && gate.beat >= curveStartBeat && gate.beat < curveEndBeat) : undefined;
          if (!start && !curveGate) throw new Error(`Missing S-curve gate: ${mode} ${stage}`);
          while (sim.trackDistance < station(curveGate ? curveGate.beat - 7 : start) && sim.phase === 'playing') sim.step(STEP, idleInput);
          const inRange = (gate: RunGate) => {
            const delta = gate.routeStation - sim.distance;
            return delta > sim.speed * sim.secondsPerBeat * 3 && delta < sim.speed * sim.secondsPerBeat * 11.5;
          };
          const hasOrdinaryGate = () => sim.previewGates.some(inRange);
          if (stage === 'normal') {
            while (!hasOrdinaryGate() && sim.phase === 'playing') sim.step(STEP, idleInput);
          }
          graphics.update(sim, true);
          const route = stage === 'entry' || stage === 'branch' ? sim.branch?.layout.right : undefined;
          const gate = curveGate ?? [...scene.visuals.keys()].find(gate => inRange(gate) && gate.route === route);
          if (!gate) throw new Error(`No sampled gate: ${volume.id} ${mode} ${stage}`);
          const visual = scene.visuals.get(gate)!;
          const update = visual.update.bind(visual);
          let ahead = 0;
          visual.update = (time, hue, distance, scale, hit, microContrast, saturation) => {
            ahead = distance;
            return update(time, hue, distance, scale, hit, microContrast, saturation);
          };
          graphics.update(sim, true);
          const mesh = visual.meshes[0];
          let previous = mesh.position.clone();
          let previousAlong = sim.distance + ahead;
          const visible = mesh.visible;
          const peak = { idle: 0, press: 0, release: 0 };
          const travel = { idle: 0, press: 0, release: 0 };
          let maxPathError = 0, maxNormalError = 0;
          let maxAheadIncrease = 0;
          const cameraSeams = [];
          let crossingError = 0;
          let previousAhead = ahead;
          const readContrast = () => visual.mat.uniforms.uMicroContrast?.value as number | undefined;
          let lastContrast = readContrast();
          let minContrast = lastContrast ?? null;
          let contrastStep = 0;
          let cameraPosition = graphics.camera!.position.clone();
          let cameraRotation = graphics.camera!.quaternion.clone();
          for (let tick = 0; !gate.judged && tick < 600; tick++) {
            const part = tick < 12 ? 'idle' : tick < 42 ? 'press' : 'release';
            const previousTime = sim.time;
            const previousTrack = sim.trackDistance;
            sim.step(STEP, { ...idleInput, boosting: part === 'press' });
            graphics.update(sim, true);
            const contrast = readContrast();
            if (contrast !== undefined && lastContrast !== undefined) {
              contrastStep = Math.max(contrastStep, Math.abs(contrast - lastContrast));
              minContrast = Math.min(minContrast!, contrast);
            }
            lastContrast = contrast;
            const camera = graphics.camera!;
            for (const seam of [SPLIT_BEAT, REJOIN_BEAT]) {
              if (previousTrack < station(seam) && sim.trackDistance >= station(seam)) {
                cameraSeams.push({ beat: seam, step: cameraPosition.distanceTo(camera.position),
                  turn: cameraRotation.angleTo(camera.quaternion) * 180 / Math.PI });
              }
            }
            cameraPosition = camera.position.clone();
            cameraRotation = camera.quaternion.clone();
            if (!mesh.visible) continue;
            const along = sim.distance + ahead;
            const junction = scene.junction;
            const frame = gate.route && junction ? junction.path.sample(gate.worldStation, 'right') : scene.path.sample(gate.worldStation);
            maxPathError = Math.max(maxPathError, mesh.position.distanceTo(frame.p));
            if (curveGate) {
              const normal = frame.f.clone().set(0, 0, -1).applyQuaternion(mesh.quaternion);
              maxNormalError = Math.max(maxNormalError, normal.distanceTo(frame.f));
            }
            peak[part] = Math.max(peak[part], previous.distanceTo(mesh.position));
            travel[part] += Math.abs(along - previousAlong);
            maxAheadIncrease = Math.max(maxAheadIncrease, ahead - previousAhead);
            if (gate.judged) {
              const k = (gate.crossedAt! - previousTime) / STEP;
              crossingError = Math.abs(ahead + (sim.distance - (previousAlong - previousAhead)) * (1 - k));
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
            peak, travel, maxPathError, maxNormalError, maxAheadIncrease, crossingError, fadeDrift, fadeFrames, cameraSeams, minContrast, contrastStep });
        }
      }
    }
    const drift = VOLUMES[1];
    const driftPath = new Simulation(drift).path;
    graphics.load(drift, driftPath);
    const scene = Reflect.get(graphics, 'volume') as { visuals: Map<RunGate, GateVisual>; path: Path };
    const runToGate = (mode: PlayMode, boosting: boolean) => {
      const sim = new Simulation(drift, flags, driftPath, mode);
      sim.start('normal', 0, undefined, mode);
      while (sim.beat < 56) sim.step(STEP, idleInput);
      const gate = (Reflect.get(sim, 'chart') as RunGate[]).find(gate => gate.beat >= 64)!;
      while (!gate.judged) {
        const before = sim.trackDistance;
        const time = sim.time;
        const passed = sim.gatesPassed;
        sim.step(STEP, { ...idleInput, boosting });
        if (gate.judged) {
          const along = before + (sim.trackDistance - before) * (gate.crossedAt! - time) / STEP;
          graphics.update(sim, true);
          const mesh = scene.visuals.get(gate)!.meshes[0];
          return { beat: gate.beat, along, crossedAt: gate.crossedAt!, visible: mesh.visible, passed: sim.gatesPassed === passed + 1,
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
