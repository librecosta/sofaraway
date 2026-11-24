import { expect, test } from '@playwright/test';
import type { GameOptions } from '../../app/game/contracts';
import type { AudioTransport } from '../../app/game/audio/transport.client';
import { STEP } from '../../app/game/core/clock';
import type { FixedStepClock } from '../../app/game/core/clock';
import type { Simulation } from '../../app/game/core/simulation';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';
import { RECORDS_KEY } from '../../app/game/runtime/records.client';

const savedRecords = JSON.stringify({
  version: 1,
  standard: { elsewhere: { normal: { best: 1234, last: { score: 1234, outcome: 'ESCAPED' } } } },
  sightseeing: { elsewhere: { last: { score: 234, outcome: 'ESCAPED' } } },
});

const flights = [
  { volume: 'elsewhere', route: 'main', quality: 'low', wide: false, lights: true },
  { volume: 'daybreak', route: 'challenge', quality: 'auto', wide: true, lights: true },
  { volume: 'descent', route: 'score', quality: 'high', wide: false, lights: false },
  { volume: 'orbit', route: 'challenge', quality: 'auto', wide: true, lights: true },
] as const;

interface ShowcaseTestWindow extends Window {
  showcaseRuntime?: Runtime;
}

for (const { volume, route, quality, wide, lights } of flights) {
  test(`${volume} starts an audible Showcase and completes the Impossible flight in the browser`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /WebGL|shader|GL_INVALID/i.test(message.text())) errors.push(message.text());
    });
    await page.setViewportSize(wide ? { width: 1920, height: 1080 } : { width: 960, height: 540 });
    await page.addInitScript(({ key, records, lights }) => {
      localStorage.setItem(key, records);
      localStorage.setItem('sofaraway.dynamicLights', String(lights));
      localStorage.setItem('sofaraway.difficulty', 'normal');
    }, { key: RECORDS_KEY, records: savedRecords, lights });
    await page.goto(`http://127.0.0.1:8091/?vol=${volume}&q=${quality}`);
    await expect(page.locator('[data-act=start]')).toBeEnabled();
    await page.evaluate(async () => {
      const resources = performance.getEntriesByType('resource');
      const entry = resources.filter(item => new URL(item.name).pathname === '/app/game/runtime/GameRuntime.client.ts').at(-1)!;
      const { Runtime: RuntimeClass }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(entry.name);
      const start = RuntimeClass.prototype.start;
      RuntimeClass.prototype.start = function (silent) {
        (window as ShowcaseTestWindow).showcaseRuntime = this;
        RuntimeClass.prototype.start = start;
        return start.call(this, silent);
      };
    });

    await expect(page.getByRole('group', { name: 'Local records' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous play mode' }).click();
    await expect(page.getByRole('group', { name: 'Local records' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Difficulty' })).toHaveCount(0);
    const choice = page.getByRole('group', { name: 'Showcase route' });
    if (route !== 'main') await choice.getByRole('button', { name: route === 'score' ? /Previous/ : /Next/ }).click();
    await expect(choice.locator('[data-selected=true]')).toHaveAttribute('data-choice', route);
    await page.getByRole('button', { name: 'START SHOWCASE' }).click();

    const read = () => page.evaluate(() => {
      const runtime = (window as ShowcaseTestWindow).showcaseRuntime!;
      const sim: Simulation = Reflect.get(runtime, 'simulation');
      const audio: AudioTransport = Reflect.get(runtime, 'audio');
      return { phase: runtime.getSnapshot().phase, sound: audio.time, camera: sim.camera, mode: sim.mode,
        difficulty: sim.difficulty, score: sim.score, lives: sim.lives, beat: sim.beat, boosting: sim.boosting,
        flags: Reflect.get(sim, 'options'), muted: runtime.getSnapshot().muted };
    });
    await expect.poll(async () => (await read()).phase).toBe('playing');
    await expect.poll(async () => Number((await read()).sound)).toBeGreaterThan(0.2);
    await expect(page.locator('#hud')).toHaveCount(0);
    await expect(page.locator('#cursor')).toBeHidden();
    await expect(page.locator('#gl')).toHaveCSS('cursor', 'none');
    await expect(page.locator('#over')).toBeHidden();
    expect(await read()).toMatchObject({ mode: 'standard', difficulty: 'impossible', lives: 1, score: 0, flags: {} });

    await page.keyboard.press('m');
    expect((await read()).muted).toBe(true);
    await page.keyboard.press('m');
    expect((await read()).muted).toBe(false);
    await page.keyboard.press('p');
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
    const paused = await read();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Shift');
    await page.mouse.move(955, 10);
    expect((await read()).beat).toBe(paused.beat);
    await page.getByRole('button', { name: 'RESUME', exact: true }).click();
    await expect.poll(async () => (await read()).phase).toBe('playing');
    await expect.poll(async () => typeof (await read()).sound).toBe('number');
    await page.mouse.move(950, 10);
    await page.mouse.down();
    expect((await read()).boosting).toBe(false);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('ArrowRight');
    await page.locator('#gl').screenshot({ path: info.outputPath(`${volume}-showcase.png`) });

    // Advance the clock between rendered checkpoints. The runtime still owns
    // the pilot, fixed-step simulation, rendering, ending and record policy.
    const observed = await page.evaluate(({ step }) => {
      const runtime = (window as ShowcaseTestWindow).showcaseRuntime!;
      const sim: Simulation = Reflect.get(runtime, 'simulation');
      const clock: FixedStepClock = Reflect.get(runtime, 'clock');
      const graphics: Graphics = Reflect.get(runtime, 'graphics');
      const { saveRecords, diagnostics }: GameOptions = Reflect.get(runtime, 'options');
      const frame = Reflect.get(runtime, 'frame') as (now: number) => void;
      const updateClock = Reflect.get(runtime, 'runTime');
      const duration = sim.volume.beats * sim.secondsPerBeat;
      let target = clock.elapsed, now = performance.now();
      const phases = new Set([sim.outroPhase]);
      const runFrame = (dt = step) => {
        cancelAnimationFrame(Reflect.get(runtime, 'raf'));
        frame(now += dt * 1000);
        phases.add(sim.outroPhase);
      };
      Reflect.set(runtime, 'runTime', () => target);
      const begin = performance.now();
      try {
        while (runtime.getSnapshot().phase === 'playing') {
          target = Math.min(duration + 2, clock.elapsed + 1.5);
          if (target <= clock.elapsed + step / 2) throw new Error('The flight did not reach Music End.');
          do { runFrame(); } while (runtime.getSnapshot().phase === 'playing' && clock.elapsed < target - step / 2);
        }
        if (runtime.getSnapshot().phase !== 'crash') throw new Error('The runtime skipped the ending transition.');
        const settledAt = now + 10_000;
        while (runtime.getSnapshot().phase === 'crash' && now < settledAt) runFrame(step * 8);
      } finally {
        Reflect.set(runtime, 'runTime', updateClock);
      }
      return { snapshot: runtime.getSnapshot(), phases: [...phases], saveRecords, diagnostics,
        glError: graphics.gl.getError(), measuredMs: performance.now() - begin };
    }, { step: STEP });
    expect(observed.saveRecords).toBe(true);
    expect(observed.diagnostics).toMatchObject({ fixedTime: null, autoplay: false, debug: false, god: false, align: false, post: true });
    expect(observed.snapshot).toMatchObject({ phase: 'results', score: 0, lives: 1, route,
      result: { title: 'ESCAPED', accuracy: 1, unreached: 0 }, encore: { missed: 0, neutralized: 0, bonusScore: 0 } });
    expect(observed.snapshot.encore?.passed).toBeGreaterThan(0);
    expect(observed.phases).toEqual(['main', 'transition', 'encore', 'afterglow']);
    expect(observed.glError).toBe(0);
    await info.attach('flight', { body: JSON.stringify(observed), contentType: 'application/json' });
    await expect(page.getByRole('heading', { name: 'SHOWCASE COMPLETE' })).toBeVisible();
    await expect(page.locator('#over-score')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY)).toBe(savedRecords);

    await page.getByRole('button', { name: 'REPLAY', exact: true }).click();
    await expect.poll(async () => (await read()).phase).toBe('playing');
    if (volume === 'orbit') {
      const canvas = page.locator('#gl');
      await canvas.evaluate(element => {
        const extension = (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
        element.addEventListener('test-restore', () => extension.restoreContext(), { once: true });
        extension.loseContext();
      });
      await expect.poll(async () => (await read()).phase).toBe('paused');
      const beat = (await read()).beat;
      await canvas.dispatchEvent('test-restore');
      await expect.poll(async () => (await read()).phase).toBe('playing');
      await expect.poll(async () => (await read()).beat).toBeGreaterThan(beat);
      await expect.poll(async () => typeof (await read()).sound).toBe('number');
      await expect(page.locator('#hud')).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'START SHOWCASE' })).toBeEnabled();
    expect((await read()).sound).toBe('audio');
    await page.getByRole('button', { name: 'Next play mode' }).click();
    await expect(page.getByRole('group', { name: 'Local records' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Difficulty' }).locator('[data-selected=true]')).toHaveText('NORMAL');
    await expect(page.locator('#hud')).toHaveCount(1);
    if (volume === 'elsewhere') {
      await expect(page.getByRole('group', { name: 'Local records' })).toContainText('1,234');
      await page.getByRole('button', { name: 'Next play mode' }).click();
      await expect(page.getByRole('group', { name: 'Local records' })).toContainText('234');
      await page.getByRole('button', { name: 'Next volume' }).click();
      await expect(page).toHaveURL(/vol=daybreak/);
      await expect(page.getByRole('button', { name: 'Next play mode' })).toBeEnabled();
    }
    expect(await page.evaluate(key => localStorage.getItem(key), RECORDS_KEY)).toBe(savedRecords);
    expect(errors).toEqual([]);
  });
}
