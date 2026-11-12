import { expect, test } from '@playwright/test';
import { chartFor } from '../../app/game/core/chart';
import { STEP } from '../../app/game/core/clock';
import type { FixedStepClock } from '../../app/game/core/clock';
import type { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import type { GameOptions } from '../../app/game/contracts';
import type { Graphics } from '../../app/game/graphics/scene.client';
import type { Runtime } from '../../app/game/runtime/GameRuntime.client';

test('an Easy Square hit keeps the viewport steady and a backlog recovers before manual pause', async ({ page }) => {
  const volume = volumeById('elsewhere');
  const gate = chartFor(volume, 'easy').find(gate => gate.kind === 'square')!;
  await page.goto('http://127.0.0.1:8091/?q=low&align=1');
  await page.locator('[data-diff=easy]').click();
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  const result = await page.evaluate(async ({ step, gateBeat }) => {
    const entry = performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname === '/app/game/runtime/GameRuntime.client.ts').at(-1)!;
    const { Runtime: RuntimeClass }: typeof import('../../app/game/runtime/GameRuntime.client') = await import(entry.name);
    let active: Runtime | undefined;
    const start = RuntimeClass.prototype.start;
    RuntimeClass.prototype.start = function () { active = this; return start.call(this, true); };
    try {
      document.querySelector<HTMLButtonElement>('[data-act=start]')!.click();
    } finally {
      RuntimeClass.prototype.start = start;
    }
    if (!active) throw new Error('The game did not start on the instrumented runtime.');
    const runtime = active;
    const simulation: Simulation = Reflect.get(runtime, 'simulation');
    const clock: FixedStepClock = Reflect.get(runtime, 'clock');
    const options: GameOptions = Reflect.get(runtime, 'options');
    // Advance the earlier gates through normal collision; drive the Square with pointer input.
    const approachTime = (gateBeat - 1) * simulation.secondsPerBeat;
    while (clock.elapsed < approachTime) {
      clock.consume(clock.elapsed + step, () => Reflect.apply(Reflect.get(runtime, 'step'), runtime, [simulation]));
    }
    const before = { lives: simulation.lives, passed: simulation.gatesPassed, judged: simulation.gatesJudged };
    options.diagnostics.align = false;
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerType: 'mouse', clientX: innerWidth * 0.85, clientY: innerHeight / 2,
    }));
    const frame: FrameRequestCallback = Reflect.get(runtime, 'frame');
    let now = (Reflect.get(Reflect.get(runtime, 'timeline'), 'origin') + clock.elapsed) * 1000 + 0.1;
    const advance = (ms: number) => {
      cancelAnimationFrame(Reflect.get(runtime, 'raf'));
      now += ms;
      frame(now);
    };
    const opacity = () => Number(document.getElementById('flash')!.style.opacity);
    for (let i = 0; i < 60 && simulation.gatesJudged === before.judged; i++) advance(step * 1000);
    const hit = { lives: simulation.lives, passed: simulation.gatesPassed, judged: simulation.gatesJudged,
      hits: simulation.hits, phase: runtime.getSnapshot().phase, opacity: opacity(),
      transform: getComputedStyle(document.querySelector('main')!).transform };
    const hitTime = simulation.time;
    for (let i = 0; i < 3; i++) advance(step * 1000);
    const continued = simulation.time > hitTime && runtime.getSnapshot().phase === 'playing';
    const graphics: Graphics = Reflect.get(runtime, 'graphics');
    let draws = 0;
    const draw = graphics.draw.bind(graphics);
    graphics.draw = (...args) => { draws++; return draw(...args); };
    const beforeStall = simulation.time;
    advance(160);
    advance(step * 1000);
    const { phase, pauseReason } = runtime.getSnapshot();
    const recovered = { phase, pauseReason, timeAdvanced: simulation.time > beforeStall, draws };
    graphics.draw = draw;
    runtime.pause('user');
    return { before, hit, continued, recovered };
  }, { step: STEP, gateBeat: gate.beat });

  expect(result.before.passed).toBe(result.before.judged);
  expect(result.hit).toMatchObject({
    lives: result.before.lives - 1, passed: result.before.passed, judged: result.before.judged + 1,
    hits: 1, phase: 'playing',
  });
  expect(result.hit.opacity).toBeGreaterThan(0);
  expect.soft(result.hit.transform).toBe('none');
  expect(result.continued).toBe(true);
  expect(result.recovered).toEqual({ phase: 'playing', pauseReason: null, timeAdvanced: true, draws: 2 });

  const dialog = page.getByRole('dialog', { name: 'PAUSED' });
  await expect(dialog.getByText('Your run is paused.')).toBeVisible();
  const actions = dialog.getByRole('button');
  await expect(actions).toHaveCount(3);
  const gap = await actions.evaluateAll(buttons => {
    const rects = buttons.map(button => button.getBoundingClientRect());
    return Math.min(...rects.slice(1).map((rect, index) => rect.left - rects[index].right));
  });
  expect.soft(gap).toBeGreaterThanOrEqual(10);
  await page.setViewportSize({ width: 320, height: 640 });
  await expect(page.locator('#gl')).toHaveAttribute('width', '320');
  for (const action of await actions.all()) await expect(action).toBeInViewport();
  await dialog.getByRole('button', { name: 'SETTINGS' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'CLOSE' }).click();
  await dialog.getByRole('button', { name: 'BACK TO MENU' }).click();
  await expect(page.locator('[data-act=start]')).toBeVisible();
});
