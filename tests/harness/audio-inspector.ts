import { DaybreakSynthesizer } from '../../app/game/audio/daybreak.client';
import { daybreakStems } from '../../app/game/core/daybreak-score';
import type { DaybreakStem } from '../../app/game/core/daybreak-score';
import { volumeById } from '../../app/game/core/volumes';
import { defaultMix, inspectorScore } from '../../app/game/debug/audio/track-adapter';
import { inspectorSource } from '../../app/game/debug/audio/source.client';
import type { Mix, TrackId } from '../../app/game/debug/audio/track-adapter';

const rate = 44_100;
const score = inspectorScore(volumeById('daybreak'));
const audioSeconds = 4;
const from = 78;

function compare(a: AudioBuffer, b?: AudioBuffer, factor = 1, start = 0, end = a.duration) {
  let peak = 0, sum = 0, reference = 0;
  for (let channel = 0; channel < 2; channel++) {
    const x = a.getChannelData(channel), y = b?.getChannelData(channel);
    for (let i = Math.round(start * rate); i < Math.round(end * rate); i++) {
      const delta = x[i] - (y?.[i] ?? 0) * factor;
      peak = Math.max(peak, Math.abs(delta));
      sum += delta * delta;
      reference += x[i] * x[i];
    }
  }
  return { peak, rms: Math.sqrt(sum / ((end - start) * rate * 2)), relative: Math.sqrt(sum / reference) };
}

export async function inspectAudioRouting() {
  async function render(settings: Mix, solo: DaybreakStem | null, track: TrackId | null, production = false) {
    const context = new OfflineAudioContext(2, audioSeconds * rate, rate);
    const synth = production ? new DaybreakSynthesizer(context, context.destination)
      : inspectorSource(context, score, context.destination, settings, solo, track);
    for (let i = from / score.step; i < (from + audioSeconds) / score.step; i++) {
      synth.playStep(i, i * score.step - from);
    }
    const result = await context.startRendering();
    synth.dispose();
    return result;
  }

  const audition = await render(defaultMix(), null, 'kick');
  const official = await render(defaultMix(), null, null, true);
  const inspector = await render(defaultMix(), null, null);
  const solo = await render(defaultMix(), 'kick', null);
  const settings = defaultMix();
  settings.kick.level = .5;
  const quiet = await render(settings, null, 'kick');
  for (const id of daybreakStems) settings[id].muted = true;
  const muted = await render(settings, null, null);
  const master = await render(settings, null, 'master');
  return { mix: compare(official, inspector), master: compare(official, master), isolated: compare(solo, audition),
    muted: compare(muted), gain: compare(quiet, audition, .5), kick: compare(audition), official: compare(official) };
}

export async function inspectDrumCues() {
  async function cue(position: number) {
    const ctx = new OfflineAudioContext(2, .25 * rate, rate);
    const source = inspectorSource(ctx, score, ctx.destination, defaultMix(), null, 'snare');
    const firstStep = Math.floor(position / score.step);
    source.playStep(firstStep, firstStep * score.step - position + .04, position - 1e-8);
    return compare(await ctx.startRendering());
  }
  const ctx = new OfflineAudioContext(2, audioSeconds * rate, rate);
  const synth = new DaybreakSynthesizer(ctx, ctx.destination);
  for (let i = 140 / score.step; i < 144 / score.step; i++) synth.playStep(i, i * score.step - 140);
  const outro = await ctx.startRendering();
  // The full mix now carries the GLASSHOUSE outro, so check the Kick stem
  // alone for the removed isolated kick in the final bar.
  const kickCtx = new OfflineAudioContext(2, audioSeconds * rate, rate);
  const kickSource = inspectorSource(kickCtx, score, kickCtx.destination, defaultMix(), null, 'kick');
  for (let i = 140 / score.step; i < 144 / score.step; i++) kickSource.playStep(i, i * score.step - 140);
  const kickOutro = await kickCtx.startRendering();
  return {
    upcomingSnare: await cue(80.51),
    pastSnare: await cue(80.54),
    precedingKick: compare(outro, undefined, 1, .78, .9),
    finalBar: compare(kickOutro, undefined, 1, 2),
  };
}

declare global {
  interface Window {
    inspectAudioRouting: typeof inspectAudioRouting;
    inspectDrumCues: typeof inspectDrumCues;
  }
}

window.inspectAudioRouting = inspectAudioRouting;
window.inspectDrumCues = inspectDrumCues;
