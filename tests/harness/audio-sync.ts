import { AudioTransport } from '../../app/game/audio/transport.client';
import { createBuffers, createMaster, Synthesizer } from '../../app/game/audio/synthesizer.client';
import type { VolumeId } from '../../app/game/contracts';
import { FixedStepClock } from '../../app/game/core/clock';
import type { RunTimeline } from '../../app/game/core/clock';
import type { RunGate, Simulation } from '../../app/game/core/simulation';
import { sectionAt, volumeById } from '../../app/game/core/volumes';
import { Runtime } from '../../app/game/runtime/GameRuntime.client';
import type { RuntimeView } from '../../app/game/runtime/GameRuntime.client';
import { Tunnel } from '../../app/game/graphics/tunnel.client';
import { signal } from './signals';

function outputTiming(context: AudioContext | undefined, scheduled?: number) {
  if (!context) return { status: 'unavailable' as const };
  const latency = (value: number) => Number.isFinite(value) && value >= 0 ? value : null;
  const properties = { sampleRate: context.sampleRate, baseLatency: latency(context.baseLatency),
    outputLatency: latency(context.outputLatency), contextTime: context.currentTime };
  if (context.state !== 'running' || !context.getOutputTimestamp) {
    return { ...properties, status: context.state !== 'running' ? 'inactive' as const : 'unavailable' as const };
  }
  const { contextTime, performanceTime } = context.getOutputTimestamp();
  const now = performance.now();
  if (contextTime === undefined || performanceTime === undefined ||
    !Number.isFinite(contextTime) || !Number.isFinite(performanceTime) || contextTime <= 0 ||
    performanceTime <= 0 || contextTime > properties.contextTime + 0.010 || performanceTime > now + 100) {
    return { ...properties, status: 'invalid' as const, outputContextTime: contextTime, outputPerformanceTime: performanceTime };
  }
  return { ...properties, status: 'valid' as const, outputContextTime: contextTime, outputPerformanceTime: performanceTime,
    outputEstimateNow: contextTime + (now - performanceTime) / 1000,
    scheduledPerformanceTime: scheduled === undefined ? null : performanceTime + (scheduled - contextTime) * 1000 };
}

const voices = ['_kick', '_snare', '_hat', '_bass', '_pluck', '_pad', '_riser', '_impact', '_duck'] as const;

async function score(id: VolumeId) {
  const volume = volumeById(id);
  const stepSeconds = 15 / volume.bpm;
  const rate = 24_000;
  const lead = 0.12;
  const regions = [];
  let start = 0;
  for (const section of volume.sections) {
    regions.push({ section: section.name, boundary: start, from: Math.max(0, start - 4), to: start + 8 });
    start += section.beats;
  }
  regions.push({ section: 'tail', boundary: volume.beats, from: volume.beats - 12, to: volume.beats });
  const levels = [];
  const buffers = createBuffers(new OfflineAudioContext(2, 128, rate));
  for (const region of regions) {
    const boundary = lead + (region.boundary - region.from) * stepSeconds * 4;
    const end = lead + (region.to - region.from) * stepSeconds * 4;
    const context = new OfflineAudioContext(2, Math.ceil((end + 2.0) * rate), rate);
    const synth = new Synthesizer(context, volume, createMaster(context, 0.8), buffers);
    for (let step = region.from * 4; step < region.to * 4; step++) {
      synth.playStep(step, lead + (step - region.from * 4) * stepSeconds);
    }
    const buffer = await context.startRendering();
    levels.push({ ...region, before: region.boundary > 0 ? signal(buffer, boundary - 2 * stepSeconds, boundary) : null,
      after: signal(buffer, boundary, Math.min(end + 0.5, boundary + 2 * stepSeconds)),
      sectionSignal: signal(buffer, boundary < end ? boundary : lead, end),
      tail: region.section === 'tail' ? signal(buffer, end, end + 1.9) : null });
  }

  const context = new OfflineAudioContext(2, 128, rate);
  const synth = new Synthesizer(context, volume, createMaster(context, 0.8), buffers);
  const events: { step: number; voice: typeof voices[number]; args: unknown[] }[] = [];
  let step = 0;
  for (const voice of voices) Reflect.set(synth, voice, (...args: unknown[]) => events.push({ step, voice, args }));
  for (; step < volume.beats * 4; step++) synth.playStep(step, step * stepSeconds);
  const bytes = new TextEncoder().encode(JSON.stringify(events));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const sectionVoices = levels.slice(0, -1).map(({ section, boundary }) => ({
    section, boundary, counts: Object.fromEntries(voices.map(voice => [voice,
      events.filter(event => event.voice === voice && sectionAt(volume, event.step / 4)?.start === boundary).length])),
  }));
  return { digest, events: events.length, levels, sectionVoices, last: events.at(-1), rate,
    transitions: events.filter(event => event.voice === '_riser' || event.voice === '_impact')
      .map(event => ({ beat: event.step / 4, voice: event.voice })) };
}

type Scheduled = { run: number; step: number; at: number; trigger: number };
type Frame = ReturnType<typeof frameState> & {
  wall: number; fov?: number; hue?: number; pulse: number; flash: number; output: ReturnType<typeof outputTiming>;
};

function frameState(runtime: Runtime) {
  const sim = Reflect.get(runtime, 'simulation') as Simulation;
  const clock = Reflect.get(runtime, 'clock') as FixedStepClock;
  const audio = Reflect.get(runtime, 'audio') as AudioTransport;
  const ctx = Reflect.get(audio, 'context') as AudioContext | undefined;
  const chart = Reflect.get(sim, 'chart') as RunGate[];
  return { phase: runtime.getSnapshot().phase, pauseReason: runtime.getSnapshot().pauseReason, elapsed: clock.elapsed,
    simTime: sim.time, beat: sim.beat, section: sim.section, score: Math.floor(sim.score), lives: sim.lives,
    judged: sim.gatesJudged, passed: sim.gatesPassed, total: sim.gatesTotal,
    neutralized: sim.gatesNeutralized, lastGateCrossedAt: chart.at(-1)?.crossedAt,
    audio: { ...audio.diagnostics }, soundUnavailable: runtime.getSnapshot().soundUnavailable,
    pausedAt: Reflect.get(runtime, 'pausedAt') as number,
    anchor: Reflect.get(audio, 'anchor') as number, offset: Reflect.get(audio, 'offset') as number,
    scheduler: Reflect.get(audio, 'timer') !== undefined, runBus: !!Reflect.get(audio, 'synth'),
    contextState: ctx?.state ?? null, gain: (Reflect.get(audio, 'master') as GainNode | undefined)?.gain.value ?? null };
}

export function installSyncHarness(getRuntime: () => Runtime | undefined) {
  const activeAudio = () => Reflect.get(getRuntime()!, 'audio') as AudioTransport;
  const context = () => Reflect.get(activeAudio(), 'context') as AudioContext | undefined;
  const runs = new WeakMap<Synthesizer, number>();
  const steps: Scheduled[] = [];
  const sections: Frame[] = [];
  let firstBeforeAnchor: Frame | undefined;
  let firstTick: Frame | undefined;
  let firstBeat: Frame | undefined;
  let finale: Frame | undefined;
  let end: Frame | undefined;
  let lastGate: Frame | undefined;
  let maxQuantization = 0;
  let minQuantization = 0;
  let runCount = 0;
  let pulse = 0, flash = 0;
  const observedViews = new WeakSet<RuntimeView>();
  const tunnelPulse = Tunnel.prototype.pulse;
  Tunnel.prototype.pulse = function (value) {
    pulse = value;
    tunnelPulse.call(this, value);
  };

  const playStep = Synthesizer.prototype.playStep;
  Synthesizer.prototype.playStep = function (step, at) {
    const ctx = getRuntime() && context();
    if (ctx && Reflect.get(this, 'ctx') === ctx) {
      if (!runs.has(this)) runs.set(this, ++runCount);
      steps.push({ run: runs.get(this)!, step, at, trigger: ctx.currentTime });
    }
    playStep.call(this, step, at);
  };
  const sample = (runtime: Runtime, scheduled?: number): Frame => {
    const graphics = Reflect.get(runtime, 'graphics') as { camera?: { fov: number } } | undefined;
    const scene = graphics && Reflect.get(graphics, 'volume') as { hue: number } | undefined;
    return { ...frameState(runtime), wall: performance.now(), fov: graphics?.camera?.fov, hue: scene?.hue,
      pulse, flash, output: outputTiming(context(), scheduled) };
  };
  const draw = Reflect.get(Runtime.prototype, 'draw') as (sim: Simulation, now: number, update?: boolean) => void;
  Reflect.set(Runtime.prototype, 'draw', function (this: Runtime, sim: Simulation, now: number, update?: boolean) {
    if (getRuntime() !== this) { draw.call(this, sim, now, update); return; }
    const view = Reflect.get(this, 'view') as RuntimeView;
    if (!observedViews.has(view)) {
      observedViews.add(view);
      const previous = view.flash;
      view.flash = (opacity, color) => { flash = opacity; previous.call(view, opacity, color); };
    }
    draw.call(this, sim, now, update);
    if (this.getSnapshot().phase === 'playing') {
      const elapsed = (Reflect.get(this, 'clock') as FixedStepClock).elapsed;
      const timeline = Reflect.get(this, 'timeline') as RunTimeline;
      const gap = timeline.at(now / 1000) - elapsed;
      maxQuantization = Math.max(maxQuantization, gap);
      minQuantization = Math.min(minQuantization, gap);
      if (!firstBeforeAnchor && elapsed === 0 && steps.length && (context()?.currentTime ?? Infinity) < steps[0].at) {
        firstBeforeAnchor = sample(this, steps[0].at);
      }
      if (!firstTick && elapsed > 0) firstTick = sample(this, steps[0]?.at);
      if (!firstBeat && sim.beat >= 1) firstBeat = sample(this);
      if (sections.at(-1)?.section !== sim.section) {
        const start = sectionAt(sim.volume, sim.beat)?.start ?? sim.volume.beats;
        sections.push(sample(this, (Reflect.get(activeAudio(), 'anchor') as number) + start * sim.secondsPerBeat));
      }
      if (!lastGate && sim.gatesJudged > 0 && sim.gatesJudged === sim.gatesTotal) lastGate = sample(this);
      if (!finale && sim.beat >= sim.volume.beats - 12) finale = sample(this);
    } else if (!end && sim.phase === 'crash' && sim.beat === sim.volume.beats) {
      end = sample(this);
    }
  });

  window.syncHarness = {
    clear() {
      steps.length = sections.length = 0;
      firstBeforeAnchor = firstTick = firstBeat = end = lastGate = finale = undefined;
      maxQuantization = minQuantization = 0;
    },
    inspect: () => sample(getRuntime()!),
    trace: () => ({ steps, sections, firstBeforeAnchor, firstTick, firstBeat, end, lastGate, finale, maxQuantization, minQuantization }),
    suspend: () => context()?.suspend(),
    setLevel(volume: number, muted: boolean) { getRuntime()?.setVolume(volume); getRuntime()?.setMuted(muted); },
    score,
  };
}

declare global {
  interface Window {
    syncHarness: {
      clear(): void;
      inspect(): Frame;
      trace(): { steps: Scheduled[]; sections: Frame[]; firstBeforeAnchor?: Frame; firstTick?: Frame; firstBeat?: Frame;
        end?: Frame; lastGate?: Frame; finale?: Frame; maxQuantization: number; minQuantization: number };
      suspend(): Promise<void> | undefined;
      setLevel(volume: number, muted: boolean): void;
      score(id: VolumeId): ReturnType<typeof score>;
    };
  }
}
