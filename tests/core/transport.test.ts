import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AudioTransport } from '../../app/game/audio/transport.client';
import { FixedStepClock, STEP } from '../../app/game/core/clock';
import { VOLUMES } from '../../app/game/core/volumes';

vi.mock('../../app/game/audio/synthesizer.client', () => ({
  createMaster: vi.fn(),
  createBuffers: vi.fn(),
  Synthesizer: class { playStep = playStep; dispose = disposeRun; },
}));

const playStep = vi.fn<(step: number, at: number, after?: number) => void>();
const disposeRun = vi.fn();
class Context {
  static active: Context;
  static initialTime = 0;
  currentTime = Context.initialTime;
  state: AudioContextState = 'running';
  onstatechange?: () => void;
  destination = {};
  createGain() {
    return { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } };
  }
  constructor() { Context.active = this; }
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}

let transport: AudioTransport;
let interrupt = vi.fn<(reason: string) => void>();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', Context);
  Context.initialTime = 0;
  interrupt = vi.fn<(reason: string) => void>();
  transport = new AudioTransport(interrupt);
});
afterEach(() => {
  transport.dispose();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function advance(seconds: number, timerMs = 25) {
  Context.active.currentTime += seconds;
  vi.advanceTimersByTime(timerMs);
}

const scheduled = () => playStep.mock.calls.map(([step, at]) => [step + 0, at]);

test('a late scheduler skips expired steps and continues on the original grid', async () => {
  await transport.start(VOLUMES[0], 0);
  // The initial lookahead contains step 0 only. Step 1 is due at 177.1875 ms.
  Context.active.currentTime = 0.200;
  expect(transport.time).toBeCloseTo(0.14);
  vi.advanceTimersByTime(25);
  expect(interrupt).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(1);
  expect(scheduled()).toEqual([[0, 0.06], [2, 0.06 + 30 / 128]]);
  expect(transport.diagnostics).toMatchObject({ lateCallbacks: 1, missedSteps: 1 });
  expect(transport.diagnostics.maxDelaySeconds).toBeCloseTo(0.0228125, 9);
});

test.each([[100], [160], [250], [100, 160, 250, 160]])('scheduler delay sequence %j avoids replay and preserves the grid', async (...delays) => {
  const volume = VOLUMES[0];
  await transport.start(volume, 0);
  for (const delay of delays) {
    const queued = playStep.mock.calls.length;
    advance(delay / 1000);
    for (const [, at] of playStep.mock.calls.slice(queued)) expect(at).toBeGreaterThanOrEqual(Context.active.currentTime);
    for (let i = 0; i < 8; i++) advance(0.025);
  }
  const notes = scheduled();
  expect(new Set(notes.map(([i]) => i)).size).toBe(notes.length);
  expect(notes.at(-1)![0] + 1 - notes.length).toBe(transport.diagnostics.missedSteps);
  for (const [i, at] of notes) expect(at).toBeCloseTo(0.06 + i * 15 / volume.bpm, 9);
  expect(interrupt).not.toHaveBeenCalled();
});

test('a step exactly at the current context time stays on its grid', async () => {
  const volume = VOLUMES[3];
  Context.initialTime = 4;
  await transport.start(volume, 0);
  const at = 4.06 + 15 / volume.bpm;
  Context.active.currentTime = at;
  vi.advanceTimersByTime(25);
  expect(scheduled().slice(0, 2)).toEqual([[0, 4.06], [1, at]]);
});

test('resume suppresses played attacks and reschedules canceled future attacks', async () => {
  const volume = VOLUMES[0];
  await transport.start(volume, 0);
  advance(0.075);
  // Step 1 is queued, but at the pause point only step 0 has rendered.
  expect(scheduled().map(([step]) => step)).toEqual([0, 1]);
  // The last simulation tick can still be at zero within the 60 Hz quantization window.
  transport.stop(true);
  Context.active.currentTime = 5;
  await transport.start(volume, 0, true);
  expect(scheduled().map(([step]) => step)).toEqual([0, 1]);
  advance(0.075);
  expect(playStep.mock.calls.at(-1)).toEqual([1, 5.06 + 15 / volume.bpm]);
  transport.stop();
  await transport.start(volume, 0);
  expect(scheduled().at(-1)?.[0]).toBe(0);
});

test.each(VOLUMES)('$id lead, 25–50 ms jitter and full-song grid', async volume => {
  await transport.start(volume, 0);
  const clock = new FixedStepClock();
  const stepTime = 15 / volume.bpm;
  const expectedSteps = volume.beats * 4;
  expect(scheduled()[0]).toEqual([0, 0.06]);
  Context.active.currentTime = 0.05;
  expect(transport.time).toBe(0);
  let ticks = 0;
  const sample = () => {
    const time = transport.time;
    if (typeof time !== 'number') throw new Error(`Unexpected transport interruption: ${time}`);
    expect(clock.consume(time, () => { ticks++; })).toBe('ok');
    expect(time - clock.elapsed).toBeLessThanOrEqual(STEP + 1e-9);
  };
  for (let frame = 1; Context.active.currentTime < 0.06 + expectedSteps * stepTime; frame++) {
    Context.active.currentTime = 0.05 + frame / 120;
    if (frame % 9 === 0 || frame % 9 === 3) vi.advanceTimersByTime(25);
    sample();
  }
  expect(ticks).toBeGreaterThan(0);
  expect(interrupt).not.toHaveBeenCalled();
  expect(playStep).toHaveBeenCalledTimes(expectedSteps);
  for (const [index, [step, at]] of scheduled().entries()) {
    expect(step).toBe(index);
    expect(at).toBeCloseTo(0.06 + index * stepTime, 10);
  }
  transport.stop();
  expect(vi.getTimerCount()).toBe(0);
});

test('DAYBREAK can resume inside a step without repeating earlier onsets', async () => {
  await transport.start(VOLUMES[1], 0);
  Context.active.currentTime = .18 + .02;
  const position = transport.time;
  expect(position).toBeCloseTo(.14);
  transport.stop(true);
  Context.active.currentTime = 1;
  const resumed = playStep.mock.calls.length;
  await transport.start(VOLUMES[1], 2 / 15, true);
  const [step, at, after] = playStep.mock.calls[resumed];
  expect(step).toBe(1);
  expect(at).toBeCloseTo(1.06 + .125 - 2 / 15);
  expect(after).toBeCloseTo(.14);
});

test('DAYBREAK keeps notes queued across a 180 ms browser callback delay', async () => {
  await transport.start(VOLUMES[1], 0);
  expect(scheduled().map(([step]) => step)).toEqual([0, 1]);
  advance(.180);
  expect(scheduled().map(([step]) => step)).toEqual([0, 1, 2]);
  expect(transport.diagnostics.missedSteps).toBe(0);
});

test('canceled activation cannot leave a scheduler or replace the next run', async () => {
  class SuspendedContext extends Context {
    override state: AudioContextState = 'suspended';
  }
  vi.stubGlobal('AudioContext', SuspendedContext);
  let resolve!: () => void;
  const context = new SuspendedContext();
  vi.stubGlobal('AudioContext', function () { return context; });
  context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const first = transport.start(VOLUMES[0], 0);
  transport.stop();
  expect(await first).toBe(false);
  expect(await transport.start(VOLUMES[2], 0)).toBe(true);
  resolve();
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(1);
  expect(scheduled()).toEqual([[0, 0.06]]);
  transport.dispose();
  expect(context.close).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('suspension is visible before the state event and freezes scheduling', async () => {
  await transport.start(VOLUMES[0], 0);
  advance(0.08);
  const before = scheduled();
  Context.active.state = 'suspended';
  expect(transport.time).toBe('audio');
  advance(0, 100);
  expect(scheduled()).toEqual(before);
  Context.active.onstatechange?.();
  expect(interrupt).toHaveBeenCalledExactlyOnceWith('audio');
  expect(vi.getTimerCount()).toBe(0);
});
