import { randomSource } from '../../app/game/audio/daybreak-voices.client';
import type { AudioStem } from '../../app/game/audio/stem-routing';
import { DaybreakSynthesizer } from '../../app/game/audio/daybreak.client';
import { createBuffers, createMaster, Synthesizer } from '../../app/game/audio/synthesizer.client';
import { daybreakStems } from '../../app/game/core/daybreak-score';
import type { DaybreakStem } from '../../app/game/core/daybreak-score';
import { controlEvents } from '../../app/game/core/descent-score';
import { volumeById } from '../../app/game/core/volumes';
import { defaultMix, inspectorScore, stemsFor } from '../../app/game/debug/audio/track-adapter';
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
  return { peak, rms: Math.sqrt(sum / ((end - start) * rate * 2)), relative: reference ? Math.sqrt(sum / reference) : sum ? Infinity : 0 };
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

export async function inspectControlRouting() {
  const score = inspectorScore(volumeById('descent'));
  const tail = score.volume.soundtrack!.tail;
  const first = score.volume.beats * 4 - 48;
  const end = score.duration - first * score.step;
  async function render(inspector: boolean) {
    const ctx = new OfflineAudioContext(2, Math.round((end + tail) * rate), rate);
    const synth = inspector
      ? inspectorSource(ctx, score, ctx.destination, defaultMix(), null, 'master')
      : new Synthesizer(ctx, score.volume, ctx.destination);
    synth.finishAt?.(end);
    for (let i = first; i < score.volume.beats * 4; i++) synth.playStep(i, (i - first) * score.step);
    const audio = await ctx.startRendering();
    synth.dispose();
    return audio;
  }
  const official = await render(false);
  const inspector = await render(true);
  const at = controlEvents.find(event => event.voice === 'kick' && event.at > 3.12 && event.at < 3.24)!.at;
  async function cue(after: number) {
    const ctx = new OfflineAudioContext(2, .25 * rate, rate);
    const source = inspectorSource(ctx, score, ctx.destination, defaultMix(), null, 'master');
    source.playStep(Math.round(at / score.step), .04, after);
    const audio = await ctx.startRendering();
    source.dispose();
    return compare(audio);
  }
  return {
    mix: compare(official, inspector), tail: compare(official, undefined, 1, end, end + .2),
    tailEnd: compare(official, undefined, 1, official.duration - .1),
    upcoming: await cue(at - 1e-8), elapsed: await cue(at + .01),
  };
}

declare global {
  interface Window {
    inspectAudioRouting: typeof inspectAudioRouting;
    inspectDrumCues: typeof inspectDrumCues;
    inspectControlRouting: typeof inspectControlRouting;
  }
}

window.inspectAudioRouting = inspectAudioRouting;
window.inspectDrumCues = inspectDrumCues;
window.inspectControlRouting = inspectControlRouting;


export async function inspectVolumeStems(id: string) {
  const score = inspectorScore(volumeById(id));
  const start = id === 'elsewhere' ? 80 : id === 'daybreak' ? 78 : id === 'descent' ? 124 : 105;
  const seconds = id === 'orbit' ? 24 : 16;
  async function render(mix = defaultMix(), solo: AudioStem | null = null, audition: TrackId | null = null,
    production = false, taps = false, duration = seconds) {
    const channels = taps ? score.tracks.length * 2 : 2;
    const ctx = new OfflineAudioContext(channels, Math.round(duration * rate), rate);
    const merger = taps ? ctx.createChannelMerger(channels) : undefined;
    merger?.connect(ctx.destination);
    const output = merger ? ctx.createGain() : ctx.destination;
    const synth = production ? new Synthesizer(ctx, score.volume,
      score.volume.music === 'techno' ? createMaster(ctx, .8, output) : output,
      createBuffers(ctx, randomSource(score.volume.seed)))
      : inspectorSource(ctx, score, output, mix, solo, audition, merger ? (id, node) => {
        const stereo = ctx.createGain(); stereo.channelCount = 2; stereo.channelCountMode = 'explicit';
        const splitter = ctx.createChannelSplitter(2);
        node.connect(stereo).connect(splitter);
        const at = score.tracks.indexOf(id) * 2;
        splitter.connect(merger, 0, at); splitter.connect(merger, 1, at + 1);
      } : undefined);
    for (let i = score.volume.music === 'techno' ? Math.ceil(start / score.step) : Math.floor(start / score.step); i < (start + duration) / score.step; i++)
      synth.playStep(i, Math.max(0, i * score.step - start), start - 1e-8);
    const audio = await ctx.startRendering(); synth.dispose(); merger?.disconnect(); return audio;
  }
  const official = await render(defaultMix(), null, null, true);
  const routed = await render(defaultMix(), null, null, false, true);
  const raw = score.tracks.map((stem, index) => {
    let power = 0, peak = 0, silence = 0;
    for (let c = 0; c < 2; c++) for (const value of routed.getChannelData(index * 2 + c)) {
      if (!Number.isFinite(value)) throw new Error('Non-finite sample');
      power += value * value; peak = Math.max(peak, Math.abs(value)); if (Math.abs(value) < .00001) silence++;
    }
    return { stem, peak, rms: Math.sqrt(power / (routed.length * 2)), silence: silence / (routed.length * 2) };
  });
  const auditionTargets: AudioStem[] = id === 'elsewhere' ? ['kick','bass','arp'] : id === 'daybreak' ? ['kick','keys','lead']
    : id === 'descent' ? ['signal','chord','metal'] : ['bass','pluck','lead'];
  const isolated = [];
  for (const stem of auditionTargets) {
    const a = await render(defaultMix(), null, stem, false, false, 8);
    const b = await render(defaultMix(), stem, null, false, false, 8);
    const muted = defaultMix(); muted[stem].muted = true;
    const zero = defaultMix(); zero[stem].level = 0;
    const quiet = defaultMix(); quiet[stem].level = .5;
    isolated.push({ stem, audible: compare(a), solo: compare(a,b),
      mute: compare(await render(muted,null,stem,false,false,8)), zero: compare(await render(zero,null,stem,false,false,8)),
      quiet: compare(await render(quiet,null,stem,false,false,8)) });
  }
  const off = defaultMix(); for (const stem of stemsFor(score.volume)) off[stem].muted = true;
  return { id, window: [start,start+seconds], tracks: raw, master: compare(official,routed),
    official: compare(official), isolated, allMuted: compare(await render(off)),
    reset: compare(official,await render()), tail: score.tail };
}

declare global { interface Window { inspectVolumeStems: typeof inspectVolumeStems } }
window.inspectVolumeStems = inspectVolumeStems;
