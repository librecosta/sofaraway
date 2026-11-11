import { expect, test } from '@playwright/test';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import type { GameOptions } from '../../app/game/contracts';
import { STEP } from '../../app/game/core/clock';
import type { FixedStepClock } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { PICKUP_APPEAR_BEAT, PICKUP_BEAT, pickupForSeed } from '../../app/game/core/pickups';
import type {} from '../harness/main';
import type { Simulation } from '../../app/game/core/simulation';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';

const cases = [
  { kind: 'shield', boost: false, feedback: 'PRISM SHIELD', badge: 'SHIELD ×1' },
  { kind: 'resonance', boost: true, feedback: 'RESONANCE ×8', badge: 'RESONANCE ×8' },
  { kind: 'lumen', boost: false, feedback: 'LUMEN +5000', badge: null },
] as const;

for (const { kind, boost, feedback, badge } of cases) {
  test(`${kind} renders on approach, survives pause and resets on exit or retry`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8091/?q=low&align=1&diff=normal');
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    const seed = Array.from({ length: 30 }, (_, i) => i).find(seed => pickupForSeed(seed) === kind)!;
    const observed = await page.evaluate(async ({ seed, boost, idleInput, step, pickupBeat }) => {
      const entry = performance.getEntriesByType('resource').filter(entry =>
        new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts').at(-1)!;
      const { Runtime: RuntimeClass }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(entry.name);
      let active: Runtime | undefined;
      const start = RuntimeClass.prototype.start;
      RuntimeClass.prototype.start = function () {
        active = this;
        const options: GameOptions = Reflect.get(this, 'options');
        options.runSeed = seed;
        return start.call(this, true);
      };
      try {
        document.querySelector<HTMLButtonElement>('[data-act=start]')!.click();
      } finally {
        RuntimeClass.prototype.start = start;
      }
      if (!active) throw new Error('The game did not start on the instrumented runtime.');
      const runtime = active;
      const sim: Simulation = Reflect.get(runtime, 'simulation');
      const clock: FixedStepClock = Reflect.get(runtime, 'clock');
      const { diagnostics }: GameOptions = Reflect.get(runtime, 'options');
      const graphics: Graphics = Reflect.get(runtime, 'graphics');
      const scene = Reflect.get(graphics, 'volume') as {
        scene: import('three').Scene;
        path: import('../../app/game/graphics/path').Path;
      };
      function advance(beat: number, target = idleInput.target) {
        while (sim.beat + 1e-9 < beat && sim.phase === 'playing') {
          clock.consume(clock.elapsed + step, () => sim.step(step, { ...idleInput, boosting: boost, target }));
        }
        graphics.draw(sim, true);
      }
      function pickup() {
        return scene.scene.getObjectByName('pickup:' + sim.pickup?.kind) as Group | undefined;
      }
      function trackRelease(group: Group) {
        const meshes = group.children as Mesh<import('three').BufferGeometry, MeshBasicMaterial>[];
        let geometries = 0;
        let materials = 0;
        for (const mesh of meshes) mesh.geometry.addEventListener('dispose', () => geometries++);
        meshes[0].material.addEventListener('dispose', () => materials++);
        return () => group.parent === null && geometries === meshes.length && materials === 1;
      }
      advance(303.99);
      const pending = sim.pickup;
      const group = pickup()!;
      const released = trackRelease(group);
      const meshes = group.children as Mesh<import('three').BufferGeometry, MeshBasicMaterial>[];
      const shapes = meshes.map(mesh => mesh.geometry.type);
      const opacity = meshes[0].material.opacity;
      const section = scene.path.sample(sim.distance + sim.speed * (pickupBeat - sim.beat) * sim.secondsPerBeat);
      const projectionError = group.position.distanceTo(section.p.add(section.u));
      diagnostics.align = false;
      advance(pickupBeat, [0, 1]);
      const collected = sim.pickup;
      const removedAfterCollection = released() && !pickup();
      runtime.pause('user');
      const paused = runtime.getSnapshot();
      const beforeResume = sim.beat;
      await runtime.resume(true);
      const resumed = runtime.getSnapshot();
      const held = sim.beat === beforeResume && sim.pickup === collected;
      runtime.returnToMenu();
      const reset = !sim.pickup && !runtime.getSnapshot().shield && !runtime.getSnapshot().resonance;
      await runtime.start(true);
      const restarted = sim.pickup;
      diagnostics.align = true;
      advance(303.99);
      const abandoned = trackRelease(pickup()!);
      runtime.returnToMenu();
      await runtime.selectVolume('drift');
      const glError = graphics.gl.getError();
      const cleanup = abandoned();
      await runtime.selectVolume('elsewhere');
      // Leave the React HUD displaying the pickup message while the run is paused.
      await runtime.start(true);
      const finalSim: Simulation = Reflect.get(runtime, 'simulation');
      while (finalSim.beat + 1e-9 < 303.99) finalSim.step(step, idleInput);
      diagnostics.align = false;
      while (finalSim.beat + 1e-9 < pickupBeat) finalSim.step(step, { ...idleInput, target: [0, 1] });
      runtime.pause('user');
      return { pending, collected, shapes, opacity, projectionError, removedAfterCollection,
        paused: { phase: paused.phase, shield: paused.shield, resonance: paused.resonance, message: paused.message },
        resumed: { phase: resumed.phase, shield: resumed.shield, resonance: resumed.resonance },
        held, reset, restarted, cleanup, glError };
    }, { seed, boost, idleInput, step: STEP, pickupBeat: PICKUP_BEAT });

    const status = { shield: kind === 'shield', resonance: kind === 'resonance' ? 8 : 0 };
    expect(observed).toMatchObject({
      pending: { kind, status: 'pending' }, collected: { kind, status: 'collected' },
      paused: { phase: 'paused', message: feedback, ...status }, resumed: { phase: 'playing', ...status },
      held: true, removedAfterCollection: true, reset: true, restarted: { kind, status: 'pending' },
      cleanup: true, glError: 0,
    });
    expect(observed.shapes).toEqual(kind === 'shield' ? ['IcosahedronGeometry', 'TorusGeometry']
      : kind === 'resonance' ? ['TorusGeometry', 'TorusGeometry', 'SphereGeometry'] : ['OctahedronGeometry']);
    expect(observed.projectionError).toBeLessThan(1e-6);
    expect(observed.opacity).toBeGreaterThan(0);
    await expect(page.locator('#center-msg')).toHaveText(feedback);
    if (badge) await expect(page.locator('#hud-pickup')).toHaveText(badge);
    else await expect(page.locator('#hud-pickup')).toHaveCount(0);
    await page.getByRole('button', { name: 'BACK TO MENU' }).click();
    await expect(page.locator('#hud-pickup')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('ordinary restarts surface all three pickups per batch, even with repeated random words', async ({ page }) => {
  const lumenSeed = Array.from({ length: 30 }, (_, i) => i).find(seed => pickupForSeed(seed) === 'lumen')!;
  await page.addInitScript(seed => {
    const random = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function <T extends ArrayBufferView<ArrayBuffer>>(array: T): T {
      if (array instanceof Uint32Array && array.length === 1) { array[0] = seed; return array; }
      return random.call(this, array) as T;
    };
  }, lumenSeed);
  await page.goto('http://127.0.0.1:8090/');
  const encountered = await page.evaluate(async appear => {
    const game = window.b0Harness;
    await game.mount({ quality: 'low', diagnostics: { fixedTime: null, autoplay: false, god: false,
      align: true, boost: false, mobileQuality: false, post: true, record: false, debug: false } });
    await game.start(true);
    game.advanceAndPause(appear - 0.1);
    game.returnToMenu();
    const kinds = [];
    for (let i = 0; i < 12; i++) {
      await game.start(true);
      const encounter = game.advanceAndPause(appear + 0.2);
      kinds.push(encounter.pickup?.kind);
      game.returnToMenu();
    }
    game.dispose();
    return kinds;
  }, PICKUP_APPEAR_BEAT);
  expect(encountered[0]).toBe('lumen');
  for (let i = 0; i < 12; i += 3) {
    expect(encountered.slice(i, i + 3).sort()).toEqual(['lumen', 'resonance', 'shield']);
  }
});
