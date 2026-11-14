import { DaybreakSynthesizer, daybreakRoom, daybreakStemSends } from '../../audio/daybreak.client';
import type { DaybreakStem } from '../../audio/daybreak.client';
import { gain, randomSource } from '../../audio/daybreak-voices.client';
import { createBuffers, createMaster, Synthesizer } from '../../audio/synthesizer.client';
import { stemIds } from './track-adapter';
import type { InspectorScore, Mix, TrackId } from './track-adapter';

function setGain(param: AudioParam, value: number, at?: number) {
  if (at === undefined) param.value = value;
  else {
    param.cancelScheduledValues(at);
    param.setTargetAtTime(value, at, .008);
  }
}

export function inspectorSource(ctx: BaseAudioContext, score: InspectorScore, output: AudioNode,
  settings: Mix, solo: DaybreakStem | null, audition: TrackId | null, tap?: (id: TrackId, node: AudioNode) => void) {
  const master = gain(ctx, output, 1);
  tap?.('master', master);
  const applyMaster = (mix: Mix, track: TrackId | null, at?: number) => {
    const level = track === 'master' ? mix.master.level : track ? 1 : mix.master.muted ? 0 : mix.master.level;
    setGain(master.gain, level, at);
  };

  if (score.volume.music !== 'breakbeat') {
    // The legacy production chain owns its destination. Put its final output
    // through the inspector's transport gain and master control.
    const synth = new Synthesizer(ctx, score.volume, createMaster(ctx, .8, master),
      createBuffers(ctx, randomSource(score.volume.seed)));
    applyMaster(settings, audition);
    return {
      playStep: (step: number, at: number, after = -Infinity) => {
        if (step * score.step > after) synth.playStep(step, at);
      },
      update: (mix: Mix, _solo: DaybreakStem | null, track: TrackId | null, at?: number) => applyMaster(mix, track, at),
      dispose: () => { synth.dispose(); master.disconnect(); },
    };
  }

  const inputs = {
    kick: ctx.createGain(), snare: ctx.createGain(), hats: ctx.createGain(),
    bass: ctx.createGain(), keys: ctx.createGain(), atmos: ctx.createGain(),
  };
  const controls = {
    kick: ctx.createGain(), snare: ctx.createGain(), hats: ctx.createGain(),
    bass: ctx.createGain(), keys: ctx.createGain(), atmos: ctx.createGain(),
  };
  const ducked = ctx.createGain();
  const bassDry = gain(ctx, controls.bass, 0), bassDuck = gain(ctx, controls.bass, 1);
  inputs.bass.connect(ducked);
  inputs.bass.connect(bassDry);
  ducked.connect(bassDuck);
  const synth = new DaybreakSynthesizer(ctx, master, (mix, impulse) => {
    for (const id of stemIds) {
      const listen = controls[id];
      const input = inputs[id];
      listen.connect(mix);
      input.gain.value = id === 'atmos' ? .74 : 1;
      if (id === 'bass') continue;
      input.connect(listen);
      if (daybreakStemSends[id]) input.connect(gain(ctx, daybreakRoom(ctx, listen, impulse), daybreakStemSends[id]));
    }
    return { inputs, duck: ducked.gain };
  });

  function update(mix: Mix, isolated: DaybreakStem | null, track: TrackId | null, at?: number) {
    applyMaster(mix, track, at);
    for (const id of stemIds) {
      const value = track === 'master' ? 1 : track ? (id === track ? mix[id].level : 0)
        : (isolated && id !== isolated) || mix[id].muted ? 0 : mix[id].level;
      setGain(controls[id].gain, value, at);
    }
    const kick = track === 'master' || (!track && (!isolated || isolated === 'kick') && !mix.kick.muted && mix.kick.level > 0);
    setGain(bassDry.gain, kick ? 0 : 1, at);
    setGain(bassDuck.gain, kick ? 1 : 0, at);
  }
  for (const id of stemIds) tap?.(id, controls[id]);
  update(settings, solo, audition);
  return {
    playStep: (step: number, at: number, after?: number, restore?: boolean) => synth.playStep(step, at, after, restore),
    update,
    dispose: () => { synth.dispose(); master.disconnect(); },
  };
}
