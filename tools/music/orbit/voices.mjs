import { OrbitVoices } from '../../../app/game/audio/orbit-voices.client.ts';
import { beatSeconds, duration, seed, tail } from './score.mjs';

// Historical auditions retain their timing, event IDs and original mix.
export class OrbitSynthesizer extends OrbitVoices {
  constructor(ctx, destination, version, events) {
    super(ctx, destination, version, events, { beatSeconds, duration, seed, tail });
  }
}
