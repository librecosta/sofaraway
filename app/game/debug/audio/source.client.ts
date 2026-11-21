import { DaybreakSynthesizer, daybreakRoom, daybreakStemSends } from '../../audio/daybreak.client';
import { gain, randomSource } from '../../audio/daybreak-voices.client';
import { createBuffers, createMaster, Synthesizer } from '../../audio/synthesizer.client';
import { OrbitSynthesizer } from '../../audio/orbit.client';
import { melodyFirstArrangement } from '../../audio/orbit-m1.client';
import type { AudioStem, StemRouting } from '../../audio/stem-routing';
import { daybreakStems } from '../../core/daybreak-score';
import { inspectorGraph } from './graph.client';
import { stemsFor } from './track-adapter';
import type { InspectorScore, Mix, TrackId } from './track-adapter';

function setGain(param: AudioParam, value: number, at?: number) {
  if (at === undefined) param.value = value;
  else { param.cancelScheduledValues(at); param.setTargetAtTime(value, at, .008); }
}

export function inspectorSource(context: BaseAudioContext, score: InspectorScore, output: AudioNode,
  settings: Mix, solo: AudioStem | null, audition: TrackId | null, tap?: (id: TrackId, node: AudioNode) => void) {
  const graph = inspectorGraph(context), ctx = graph.ctx, master = gain(ctx, output, 1);
  const controls = new Map<AudioStem, GainNode>();
  const route: StemRouting = (id, mix) => {
    let control = controls.get(id);
    if (!control) {
      control = gain(ctx, mix, 1);
      controls.set(id, control);
      tap?.(id, control);
    }
    return control;
  };
  let synth: DaybreakSynthesizer | Synthesizer | OrbitSynthesizer;
  try {
    synth = score.arrangement === 'm1' ? new OrbitSynthesizer(ctx,master,route,melodyFirstArrangement)
      : score.volume.music === 'breakbeat' ? new DaybreakSynthesizer(ctx, master, (mix, impulse) => {
      return Object.fromEntries(daybreakStems.map(id => {
        const listen = route(id, mix), input = ctx.createGain();
        input.connect(listen);
        input.connect(gain(ctx, daybreakRoom(ctx, listen, impulse), daybreakStemSends[id]));
        return [id, input];
      })) as Record<typeof daybreakStems[number], GainNode>;
    }) : new Synthesizer(ctx, score.volume, score.volume.music === 'techno' ? createMaster(ctx, .8, master) : master,
      score.volume.music === 'techno' ? createBuffers(ctx, randomSource(score.volume.seed)) : undefined, route);
  } catch (error) { graph.dispose(); throw error; }
  tap?.('master', master);
  function update(mix: Mix, isolated: AudioStem | null, track: TrackId | null, at?: number) {
    setGain(master.gain, mix.master.muted ? 0 : mix.master.level, at);
    for (const id of stemsFor(score.volume, score.arrangement)) {
      // Master audition is the official reference mix; stem audition preserves stored settings.
      const value = track === 'master' ? 1 : track ? (id === track && !mix[id].muted ? mix[id].level : 0)
        : ((isolated && id !== isolated) || mix[id].muted ? 0 : mix[id].level);
      const control = controls.get(id);
      if (control) setGain(control.gain, value, at);
    }
  }
  update(settings, solo, audition);
  return {
    playStep: (step: number, at: number, after = -Infinity) => {
      if (score.volume.music !== 'techno' || step * score.step > after)
        graph.schedule(() => synth.playStep(step, at, after));
    },
    finishAt: (end: number) => { if ('finishAt' in synth) synth.finishAt(end); },
    update,
    dispose: () => { synth.dispose(); graph.dispose(); },
  };
}
