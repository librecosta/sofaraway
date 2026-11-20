import type { QualityTier, VolumeId } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { Graphics } from '../../app/game/graphics/scene.client';
import type { OrbitWorld } from '../../app/game/graphics/orbit-world.client';
import type { OrbitRock } from '../../app/game/core/orbit-field';
import type { Difficulty, PlayMode } from '../../app/game/contracts';
import type { RouteSide } from '../../app/game/core/branches';
import type { OrbitRouteGuides } from '../../app/game/graphics/orbit-route-guides.client';

/** Production render isolation, with no test switches in the game's camera policy. */
export async function inspectOrbitStability(options: { quality: QualityTier; post: boolean; motion: 'cruise' | 'boost' | 'mixed';
  beat: number; frozen?: boolean; frames?: number; volume?: VolumeId }) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:960px;height:540px;z-index:10000';
  document.body.append(canvas);
  const graphics = new Graphics(canvas, options.quality, false, { fixedTime: null, autoplay: false, align: true, god: false,
    boost: false, mobileQuality: false, post: options.post, record: false, debug: true });
  const sim = new Simulation(volumeById(options.volume ?? 'orbit'), { align: true, branchSide: 'center' });
  sim.start('normal', 0);
  graphics.resize(960, 540, 1); graphics.load(sim.volume, sim.path, 'standard');
  const boosting = options.motion !== 'cruise';
  while (sim.phase === 'playing' && sim.trackDistance < sim.reference.station(options.beat, sim.mode)) sim.step(STEP, { ...idleInput, boosting });
  const station = sim.trackDistance;
  if (options.frozen) { sim.speed = boosting ? 48 : 30; sim.boostLens = Number(boosting); }
  const frames = [], landmarks = new Map<string, string>();
  let moved = 0;
  try {
    for (let i = 0; i < (options.frames ?? 180); i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (options.frozen) { sim.beat += STEP / sim.secondsPerBeat; sim.time += STEP; }
      else sim.step(STEP, { ...idleInput, boosting: options.motion === 'boost' || options.motion === 'mixed' && i % 120 < 60 });
      graphics.draw(sim, true);
      const orbit: OrbitWorld | undefined = Reflect.get(graphics, 'volume')?.orbit;
      const chunks: Map<string, { rocks: OrbitRock[] }> | undefined = orbit && Reflect.get(orbit, 'chunks');
      for (const chunk of chunks?.values() ?? []) for (const rock of chunk.rocks) {
        const key = JSON.stringify([rock.position, rock.scale, rock.shape, rock.rotation]);
        if (landmarks.has(rock.id) && landmarks.get(rock.id) !== key) moved++;
        landmarks.set(rock.id, key);
      }
      frames.push({ fov: graphics.camera!.fov, station: sim.trackDistance, speed: sim.speed,
        boostLens: sim.boostLens, steeringWidth: sim.steeringWidth,
        metrics: graphics.metrics() });
    }
    return { frames, moved, landmarks: landmarks.size, frozenStation: station, glError: graphics.gl.getError() };
  } finally { graphics.dispose(); canvas.remove(); }
}

export async function inspectOrbitGuidance(mode: PlayMode, difficulty: Difficulty, seed: number, side: RouteSide, boost: boolean) {
  const canvas = document.createElement('canvas'); document.body.prepend(canvas);
  const graphics = new Graphics(canvas, 'low', false, { fixedTime: null, autoplay: false, align: true, god: false,
    boost, mobileQuality: false, post: false, record: false, debug: true });
  const sim = new Simulation(volumeById('orbit'), { align: true, branchSide: side });
  sim.start(difficulty, seed, undefined, mode);
  graphics.resize(960, 540, 1); graphics.load(sim.volume, sim.path, mode);
  const path = sim.junctionPath!, samples = [];
  let geometry, released = 0, guideTime = 0, choiceTime = 0;
  try {
    const stations = [path.guideStart - 20, path.guideStart + 2, path.split - 25, path.split + 5,
      path.open + 5, path.merge + 3, path.end + 25, path.end + 100];
    for (const station of stations) {
      while (sim.phase === 'playing' && sim.trackDistance < station) {
        sim.step(STEP, { ...idleInput, boosting: boost });
        if (!guideTime && sim.routeGuide) guideTime = sim.time;
        if (!choiceTime && sim.branch!.side) choiceTime = sim.time;
      }
      graphics.draw(sim, true);
      const scene = Reflect.get(graphics, 'volume');
      const guides: OrbitRouteGuides = scene.orbitGuides;
      if (!geometry) {
        geometry = guides.mesh.geometry;
        geometry.addEventListener('dispose', () => released++);
        guides.mesh.material.addEventListener('dispose', () => released++);
      }
      if (guides.mesh.geometry !== geometry) throw new Error('Route geometry was rebuilt during a junction');
      samples.push({ station: sim.trackDistance, route: sim.route, ...guides.metrics(), metrics: graphics.metrics() });
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    graphics.dispose();
    return { samples, choiceSeconds: choiceTime - guideTime, released, route: sim.route };
  } finally { if (!released) graphics.dispose(); canvas.remove(); }
}
