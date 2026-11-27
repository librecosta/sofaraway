import { controlTrack, stepsForDescent } from '../../../app/game/core/descent-score.ts';
import { encodeDescentWav, renderDescent } from '../../../app/game/audio/descent-export.client.ts';
import { bars, duration, makeScore, tail } from './score.mjs';

export async function render(version = controlTrack.id) {
  if (version === controlTrack.id) return encodeDescentWav(await renderDescent());
  const events = makeScore(version);
  const arrangement = { bars, duration, tail, voiceProfile: version, events, steps: stepsForDescent(events, bars) };
  return encodeDescentWav(await renderDescent(arrangement));
}
