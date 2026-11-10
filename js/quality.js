/* ------------------------------------------------------------------ *
 *  Quality tiers.
 *
 *  Decided once, at load, from the pointer type and the viewport — plus
 *  an optional ?q= override. Everything that costs real GPU time reads
 *  from here: MSAA on the scene target, device pixel ratio, and the
 *  number of taps in the depth-of-field gather.
 *
 *  A phone gets no MSAA (the composite already softens), 1.25x pixels
 *  and eight taps. If it still cannot hold 38 fps, main.js drops the
 *  pixel ratio to 1 at runtime for the canvas and all post targets.
 * ------------------------------------------------------------------ */

const params = new URLSearchParams(location.search);
const coarse = typeof matchMedia !== 'undefined'
  && window.matchMedia('(pointer: coarse)').matches;
const narrow = window.innerWidth < 860;
let stored = null;
try { stored = localStorage.getItem('sofaraway.quality'); } catch (e) { /* private mode */ }
const forced = params.get('q') || stored || 'auto';

const tier = (forced === 'low' || forced === 'mobile' || forced === 'high')
  ? forced
  : (coarse || narrow ? 'mobile' : 'high');

const TABLE = {
  high:   { antialias: true,  pr: 1.6,  samples: 4, taps: 14, dof: true,  ring: 1.5 },
  mobile: { antialias: false, pr: 1.25, samples: 0, taps: 8,  dof: true,  ring: 2.4 },
  low:    { antialias: false, pr: 1.0,  samples: 0, taps: 6,  dof: false, ring: 3.0 },
};

export const TIER = tier;
export const QUALITY = TABLE[tier];
export const DERIVED = { resolutionScale: 1 };
