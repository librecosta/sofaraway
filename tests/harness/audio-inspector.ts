import { DaybreakSynthesizer } from '../../app/game/audio/daybreak.client';
import { bassNote, warmSubBass } from '../../app/game/audio/daybreak-voices.client';
import { volumeById } from '../../app/game/core/volumes';
import { defaultMix, inspectorScore, stemIds } from '../../app/game/debug/audio/track-adapter';
import { inspectorSource } from '../../app/game/debug/audio/source.client';
import type { Mix, TrackId } from '../../app/game/debug/audio/track-adapter';

export async function inspectAudioRouting() {
  const score = inspectorScore(volumeById('daybreak'));
  const rate = 44_100;
  const from = 78;
  const audioSeconds = 4;

  async function render(mode: 'production' | 'inspector' | 'isolated' | 'mute' | 'bass-solo' | 'bass-audition'
    | 'bass-muted-kick' | 'bass-gain' | 'restore' | 'no-restore' | 'past-kick') {
    const context = new OfflineAudioContext(2, audioSeconds * rate, rate);
    const mix: Mix = defaultMix();
    if (mode === 'mute') for (const id of stemIds) mix[id].muted = true;
    if (mode === 'bass-muted-kick') mix.kick.muted = true;
    if (mode === 'bass-gain') mix.bass.level = .5;
    const start = mode === 'restore' || mode === 'no-restore' ? 80.405 : mode === 'past-kick' ? 80.04 : from;
    const cut = mode === 'restore' || mode === 'no-restore' || mode === 'past-kick';
    const listen: TrackId | null = mode === 'bass-audition' || mode === 'bass-gain' ? 'bass' : mode === 'past-kick' ? 'kick'
      : mode === 'restore' || mode === 'no-restore' ? 'atmos' : null;
    const solo = mode === 'bass-solo' ? 'bass' : mode === 'isolated' ? 'kick' : null;
    // For the muted-kick case, measure the bass tap while other stems can play.
    const bassTap = mode.startsWith('bass-');
    const output = bassTap ? context.createGain() : context.destination;
    const synth = mode === 'production' ? new DaybreakSynthesizer(context, output)
      : inspectorSource(context, score, output, mix, solo, listen,
        bassTap ? (id, node) => { if (id === 'bass') node.connect(context.destination); } : undefined);
    const first = Math.floor(from / score.step);
    const last = cut ? Math.floor(start / score.step) + 1 : (from + audioSeconds) / score.step;
    for (let i = first; i < last; i++) {
      synth.playStep(i, i * score.step - start + (cut ? .04 : 0), cut ? start - 1e-8 : -Infinity, mode === 'restore');
    }
    const result = await context.startRendering();
    synth.dispose();
    return result;
  }

  function compare(a: AudioBuffer, b?: AudioBuffer, seconds = audioSeconds, factor = 1) {
    let peak = 0, sum = 0, reference = 0;
    for (let channel = 0; channel < 2; channel++) {
      const x = a.getChannelData(channel), y = b?.getChannelData(channel);
      for (let i = 0; i < seconds * rate; i++) {
        const delta = x[i] - (y?.[i] ?? 0) * factor;
        peak = Math.max(peak, Math.abs(delta));
        sum += delta * delta;
        reference += x[i] * x[i];
      }
    }
    return { peak, rms: Math.sqrt(sum / (seconds * rate * 2)), relative: Math.sqrt(sum / reference) };
  }
  const official = await render('production');
  const inspector = await render('inspector');
  const solo = await render('bass-solo');
  const audition = await render('bass-audition');
  const muted = await render('mute');
  const quietBass = await render('bass-gain');
  const restored = await render('restore');
  const noRestore = await render('no-restore');
  const pastKick = await render('past-kick');
  const kick = await render('isolated');
  const bassWithoutKick = await render('bass-muted-kick');
  return { mix: compare(official, inspector), isolated: compare(solo, audition),
    muted: compare(muted), gain: compare(quietBass, audition, audioSeconds, .5),
    noHiddenDucking: compare(bassWithoutKick, audition), restored: compare(restored, undefined, .15),
    noRestore: compare(noRestore, undefined, .15), pastKick: compare(pastKick, undefined, .12),
    kick: compare(kick), official: compare(official) };
}

declare global {
  interface Window { inspectAudioRouting: typeof inspectAudioRouting }
}

window.inspectAudioRouting = inspectAudioRouting;

export async function inspectBassFoundation() {
  const rate = 44_100;

  async function harmonics(voice: typeof bassNote) {
    const ctx = new OfflineAudioContext(1, rate, rate);
    voice(ctx, ctx.destination, 45, 0, .7, .143);
    const samples = (await ctx.startRendering()).getChannelData(0);
    // The sustain window holds an integer number of A2 cycles at 110 Hz.
    return Array.from({ length: 8 }, (_, i) => {
      let real = 0, imaginary = 0;
      const frequency = (i + 1) * 110;
      for (let n = .3 * rate; n < .5 * rate; n++) {
        const phase = 2 * Math.PI * n * frequency / rate;
        real += samples[n] * Math.cos(phase);
        imaginary += samples[n] * Math.sin(phase);
      }
      return 2 * Math.hypot(real, imaginary) / (.2 * rate);
    });
  }

  async function duck(bar: number) {
    const ctx = new OfflineAudioContext(1, .11 * rate, rate);
    const envelope = ctx.createGain();
    const level = ctx.createConstantSource();
    level.connect(envelope).connect(ctx.destination);
    level.start();
    const silent = ctx.createGain();
    const synth = new DaybreakSynthesizer(ctx, silent, () => ({
      inputs: { kick: silent, snare: silent, hats: silent, bass: silent, keys: silent, atmos: silent },
      duck: envelope.gain,
    }));
    synth.playStep(bar * 16, 0);
    const output = (await ctx.startRendering()).getChannelData(0);
    return { min: Math.min(...output), recovered: output.at(-1) };
  }

  async function seek(restore: boolean) {
    const ctx = new OfflineAudioContext(2, .16 * rate, rate);
    const synth = inspectorSource(ctx, inspectorScore(volumeById('daybreak')), ctx.destination, defaultMix(), null, 'bass');
    // Seek a few milliseconds beyond the original voice's 75 ms release.
    const position = 8.655;
    synth.playStep(64, 8 - position + .04, position, restore);
    const samples = (await ctx.startRendering()).getChannelData(0);
    return Math.max(...samples.map(Math.abs));
  }

  return { legacy: await harmonics(bassNote), warm: await harmonics(warmSubBass),
    open: await duck(1), middle: await duck(4), outro: await duck(68),
    restored: await seek(true), notRestored: await seek(false) };
}

declare global {
  interface Window { inspectBassFoundation: typeof inspectBassFoundation }
}

window.inspectBassFoundation = inspectBassFoundation;
