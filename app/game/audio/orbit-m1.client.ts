import { orbitM1Events, orbitM1Steps } from '../core/orbit-m1-score';
import type { OrbitArrangement } from './orbit.client';

/** Explicit opt-in; never imported by the production Synthesizer or Volume. */
export const melodyFirstArrangement: OrbitArrangement = {
  events:orbitM1Events, steps:orbitM1Steps, melodyFirst:true,
};
