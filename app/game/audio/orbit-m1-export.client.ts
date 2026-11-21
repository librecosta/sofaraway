import { orbitM1Track } from '../core/orbit-m1-score';
import { OrbitSynthesizer } from './orbit.client';
import { melodyFirstArrangement } from './orbit-m1.client';
import { encodeStarwakeWav } from './orbit-export.client';

/** Continuous candidate graph: no block seams or changes to the official export API. */
export async function renderOrbitM1(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const ctx = new OfflineAudioContext(2, (orbitM1Track.duration+orbitM1Track.tail)*44100,44100);
  const synth = new OrbitSynthesizer(ctx,ctx.destination,undefined,melodyFirstArrangement);
  const abort = () => synth.dispose();
  signal?.addEventListener('abort',abort,{once:true});
  try {
    for (let index=0;index<orbitM1Track.bars*16;index++) synth.scheduleStep(index,0);
    synth.finishAt(orbitM1Track.duration);
    const buffer = await ctx.startRendering();
    signal?.throwIfAborted();
    return buffer;
  } finally { signal?.removeEventListener('abort',abort); synth.dispose(); }
}

export async function exportOrbitM1(signal?: AbortSignal) {
  return encodeStarwakeWav(await renderOrbitM1(signal));
}
