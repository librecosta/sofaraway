import { expect, test } from '@playwright/test';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';
import type { Simulation } from '../../app/game/core/simulation';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { GameOptions } from '../../app/game/contracts';

for (const profile of [
  { width: 1920, height: 1080, quality: 'high', lights: true, difficulty: 'impossible', side: 'left', motion: 'toggle', crossings: 4 },
  { width: 1280, height: 720, quality: 'auto', lights: false, difficulty: 'hard', side: 'right', motion: 'half', crossings: 4 },
  { width: 960, height: 540, quality: 'low', lights: true, difficulty: 'normal', side: 'center', motion: 'late', crossings: 1 },
] as const) {
  test(`DAYBREAK late gates keep a continuous white signal at ${profile.width}×${profile.height} ${profile.quality}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(profile);
    await page.addInitScript(({ difficulty, lights }) => {
      localStorage.setItem('sofaraway.difficulty', difficulty);
      localStorage.setItem('sofaraway.dynamicLights', String(lights));
    }, profile);
    await page.goto(`http://127.0.0.1:8091/?vol=daybreak&q=${profile.quality}&align=1&god=0`);
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    const result = await page.evaluate(async ({ side, motion }) => {
      const source = performance.getEntriesByType('resource').find(entry =>
        new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts')!.name;
      const { Runtime: Engine }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(source);
      let runtime: Runtime | undefined;
      const start = Engine.prototype.start;
      Engine.prototype.start = function () {
        runtime = this;
        const options: GameOptions = Reflect.get(this, 'options');
        options.runSeed = 0;
        return start.call(this, true);
      };
      try { document.querySelector<HTMLButtonElement>('[data-act=start]')!.click(); }
      finally { Engine.prototype.start = start; }
      const live = runtime!;
      cancelAnimationFrame(Reflect.get(live, 'raf'));
      Reflect.set(live, 'raf', 0);
      const sim: Simulation = Reflect.get(live, 'simulation');
      if (sim.phase !== 'playing') throw Error('The DAYBREAK runtime did not start');
      Reflect.get(sim, 'options').branchSide = side;
      // Advance the real simulation and render exactly once per tick with its own lighting time.
      const { diagnostics }: GameOptions = Reflect.get(live, 'options');
      diagnostics.fixedTime = 0;
      const graphics: Graphics = Reflect.get(live, 'graphics');
      const render: (sim: Simulation, now: number) => void = Reflect.get(live, 'draw').bind(live);
      const { gl } = graphics;
      const flash = document.querySelector<HTMLElement>('#flash')!;
      const brightness = () => {
        const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
        let total = 0, count = 0;
        const row = new Uint8Array(width * 4);
        for (const y of [.18, .34, .5, .66, .82]) {
          gl.readPixels(0, Math.floor(y * height), width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
          for (let x = 0; x < width; x += 16) {
            const i = x * 4;
            total += .2126 * row[i] + .7152 * row[i + 1] + .0722 * row[i + 2];
            count++;
          }
        }
        return total / (255 * count);
      };
      const boost = (time: number) => motion === 'half' ? time >= 72 : motion === 'late' ? time >= 138
        : time >= 136 && Math.floor((time - 136) * 4) % 2 === 0;
      const step = () => sim.step(1 / 60, { boosting: boost(sim.time), target: null, axisX: 0, axisY: 0, dragX: 0, dragY: 0 });
      while (sim.phase === 'playing' && sim.time < 137.9) step();
      let encountered = sim.encore?.encountered ?? 0;
      const frames = [];
      const beginning = performance.now();
      while (sim.time < 146.75) {
        step();
        render(sim, beginning + (sim.time - 137.9) * 1000);
        const encore = sim.encore?.encountered ?? 0;
        const next = sim.previewEncore.find(gate => !gate.judged);
        const { skyDaylight, encoreMeshes } = graphics.metrics();
        const opacity = Number(getComputedStyle(flash).opacity);
        const sceneBrightness = brightness();
        frames.push({ time: sim.time, beat: sim.beat, phase: sim.phase as Simulation['phase'], distance: sim.distance, boosting: sim.boosting,
          nextGate: next ? next.routeStation - sim.distance : null, nextEncore: next?.index,
          crossed: encore > encountered ? encore - 1 : null,
          white: sim.escapeWhite, opacity, css: Number(flash.parentElement!.style.getPropertyValue('--escape-white')),
          skyDaylight: Number(skyDaylight), encoreMeshes, sceneBrightness,
          screenedBrightness: sceneBrightness + (1 - sceneBrightness) * opacity });
        encountered = encore;
      }
      return { frames, route: sim.route, result: sim.result, glError: gl.getError(), metrics: graphics.metrics() };
    }, profile);

    const { frames } = result;
    const playing = frames.filter(frame => frame.phase === 'playing');
    const deltas = playing.slice(1).map((frame, i) => frame.white - playing[i].white);
    const crossingFrames = frames.filter(frame => frame.beat >= 276 && frame.crossed !== null);
    const crossed = new Set(crossingFrames.map(frame => frame.crossed));
    const approach = playing.filter(frame => frame.nextEncore !== undefined && crossed.has(frame.nextEncore) &&
      frame.beat >= 276 && frame.nextGate !== null && frame.nextGate > 5 && frame.nextGate < 25);
    const route = profile.side === 'left' ? 'score' : profile.side === 'right' ? 'challenge' : 'main';
    expect(result.result).toMatchObject({ title: 'ESCAPED', route, accuracy: 1, encore: { missed: 0 } });
    expect(result.glError).toBe(0);
    expect(result.metrics.postFailure).toBeNull();
    expect(playing.length).toBeGreaterThan(350);
    expect(crossingFrames).toHaveLength(profile.crossings);
    expect(approach.length).toBeGreaterThan(5);
    expect(approach.every(frame => frame.opacity <= .119 && frame.encoreMeshes > 0)).toBe(true);
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...deltas)).toBeLessThan(.019);
    expect(Math.min(...playing.slice(1).map((frame, i) => frame.skyDaylight - playing[i].skyDaylight))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...frames.map(frame => Math.abs(frame.opacity - frame.white * .99)))).toBeLessThan(1e-6);
    expect(Math.max(...frames.map(frame => Math.abs(frame.css - frame.white)))).toBeLessThan(1e-9);
    expect(Math.max(...approach.map(frame => Math.abs(frame.skyDaylight - frame.white)))).toBeLessThan(1e-9);
    expect(frames.some(frame => frame.opacity >= .989 && frame.skyDaylight >= .998 && frame.screenedBrightness >= .98)).toBe(true);
    const resultsAt = frames.findIndex(frame => frame.phase === 'results');
    expect(resultsAt).toBeGreaterThan(0);
    expect(Math.abs(frames[resultsAt].skyDaylight - frames[resultsAt - 1].skyDaylight)).toBeLessThan(.025);
    expect(frames.at(-1)!.opacity).toBeLessThan(.02);
    const crossingImageChange = Math.max(...crossingFrames.map(frame => {
      const before = frames[frames.indexOf(frame) - 1];
      return Math.abs(frame.screenedBrightness - before.screenedBrightness);
    }));
    expect(crossingImageChange).toBeLessThan(.08);
    await info.attach('60 Hz escape white trace', { body: JSON.stringify(result), contentType: 'application/json' });
    console.log('DAYBREAK ESCAPE', JSON.stringify({
      profile, gates: crossingFrames.map(frame => +frame.time.toFixed(3)), maxRise: Math.max(...deltas), crossingImageChange,
      peak: frames.find(frame => frame.opacity >= .989)?.time, results: frames[resultsAt].time,
    }));
  });
}
