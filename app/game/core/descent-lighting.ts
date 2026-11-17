import { controlEvents, controlSteps, controlTrack, step } from './descent-score';
import { ease } from './lighting-score';

export const CONTROL_PHRASE_BEATS = 16;
export const enum ControlLamp { Roof, Floor, Left, Right, Rail, Deck, DeepDeck, Stator, Alarm, Route }
export const controlLampCount = 10;
export type ControlLightView = 'all' | 'roof' | 'floor' | 'left' | 'right' | 'glass';
export const enum FacilityLightShape { Cell, Flow, Rake, Stator, Lock, Release }

const palette = {
  white: 0xc1d9ea, steel: 0x7599bf, frost: 0xa6d5ff, ice: 0x59d6ff, cyan: 0x08d9ec,
  blue: 0x4d75ff, violet: 0x8059ff, lilac: 0xb294ff, magenta: 0xf94acd, rose: 0xff6f99,
  amber: 0xffba52, copper: 0xff782e, red: 0xff442e,
} as const;
type Tint = keyof typeof palette;

// Color emphasis, side order, and world-station travel are separate controls.
const gestures = {
  steady:  [0, 0, 0, 0],
  ceiling: [1, -.35, -.28, .12],
  answer:  [.35, .55, .84, -.30],
  floor:   [-.45, 1, -.64, .24],
  forward: [.30, .63, -.58, 1],
  reverse: [.66, .44, .70, -.76],
  depth:   [-.35, .46, .42, -.46],
  stator:  [.14, .24, 0, 0],
  armed:   [.34, .53, -.58, .60],
  relay:   [.12, .60, .78, -.72],
  chase:   [.30, .62, -1, .95],
  release: [.18, .33, .24, .31],
} as const;

function phrase(label: string, roof: Tint, floor: Tint, sides: Tint, accent: Tint, pane: Tint,
  gesture: keyof typeof gestures, energy: number, warning = 0) {
  return { label, colors: [
    palette[roof], palette[floor], palette[sides], palette[gesture === 'steady' ? sides : accent],
    palette[sides], palette[accent], palette[sides], palette[accent], palette[accent], 0xffffff,
  ], rim: palette[accent], pane: palette[pane], motion: gestures[gesture], energy, warning };
}

export const controlLightPhrases = [
  // ORDER
  phrase('Idle circuit',     'frost', 'ice',   'steel',   'frost',  'ice',     'steady',  .12),
  phrase('Pilot signal',     'ice',   'blue',  'ice',     'blue',   'cyan',    'ceiling', .34),
  // LOCK
  phrase('Ceiling scan',     'cyan',  'blue',  'ice',     'violet', 'cyan',    'ceiling', .78),
  phrase('Side relay',       'blue',  'ice',   'cyan',    'lilac',  'blue',    'answer',  .81),
  phrase('Floor interlock',  'violet','cyan',  'blue',    'lilac',  'lilac',   'floor',   .86),
  phrase('Reset circuit',    'ice',   'violet','blue',    'cyan',   'ice',     'answer',  .73),
  // FLIGHT
  phrase('Rail ignition',    'blue',  'cyan',  'cyan',    'violet', 'blue',    'forward', .81),
  phrase('Transfer pulse',   'cyan',  'violet','blue',    'lilac',  'violet',  'forward', .93),
  phrase('Counterflow',      'blue',  'cyan',  'violet',  'ice',    'cyan',    'reverse', .96),
  phrase('Turnout',          'frost', 'blue',  'steel',   'lilac',  'frost',   'answer',  .55),
  phrase('Exit conveyor',    'cyan',  'blue',  'violet',  'ice',    'ice',     'forward', .87),
  // PRESSURE
  phrase('Shaft descent',    'blue',  'violet','cyan',    'lilac',  'violet',  'depth',   .75),
  phrase('Platform echoes',  'lilac', 'blue',  'blue',    'magenta','lilac',   'answer',  .89),
  phrase('Deep relay',       'violet','magenta','magenta','ice',    'magenta', 'reverse', .94),
  phrase('Load transfer',    'magenta','lilac','violet',  'rose',   'lilac',   'depth',   .96),
  phrase('Residual heat',    'rose',  'blue',  'magenta', 'copper', 'rose',    'floor',   .80),
  // HOLD
  phrase('Stator idle',      'ice',   'blue',  'steel',   'cyan',   'steel',   'stator',  .22),
  phrase('Precharge',        'lilac', 'ice',   'blue',    'violet', 'frost',   'stator',  .38),
  // LOCKDOWN
  phrase('Interlocks armed', 'amber', 'red',   'copper',  'red',    'amber',   'armed',   .90, .72),
  phrase('Red relay',        'red',   'amber', 'amber',   'red',    'copper',  'relay',   .99, .93),
  phrase('Lock cascade',     'copper','red',   'red',     'amber',  'red',     'chase',   1,   1),
  phrase('Hold the line',    'red',   'amber', 'copper',  'red',    'amber',   'relay',   .88, .78),
  // BREACH
  phrase('Pressure release', 'cyan',  'ice',   'steel',   'cyan',   'ice',     'release', .64),
  phrase('Open air',         'white', 'cyan',  'steel',   'ice',    'frost',   'release', .33),
] as const;

const voiceTiming = {
  kick:   [0, .055, .34], snare: [1, .065, .40], signal: [2, .09, .52],
  chord:  [3, .14, .83], metal: [4, .075, .46], sweep: [5, .12, .87],
} as const;

const events = controlSteps.map(indices => indices.flatMap(index => {
  const event = controlEvents[index];
  if (event.voice !== 'kick' && event.voice !== 'snare' && event.voice !== 'signal' &&
    event.voice !== 'chord' && event.voice !== 'metal' && event.voice !== 'sweep') return [];
  const [voice, rise, decay] = voiceTiming[event.voice];
  // A rising sweep illuminates the receiving end of the phrase, a falling one its departure.
  const onset = event.at + (event.voice === 'sweep' && !event.falling ? event.length * .62 : 0);
  return [{ onset, rise, decay, voice, velocity: event.velocity }];
}));
export const neutralLampGains = [1, 1, .54, .54, .46, .52, .47, 1, .67, .65] as const;
export type ControlLighting = ReturnType<typeof newControlLighting>;

export function newControlLighting() {
  return { phrase: 0, previous: 0, blend: 0, amount: 0, beat: 0, energy: 0, travel: 0, relay: 0, rim: 0, paneGain: 1,
    accents: new Float32Array(6), gains: Float32Array.from(neutralLampGains) };
}

export function controlLightingAt(beat: number, amount: number, out: ControlLighting, reducedMotion = false) {
  out.beat = beat;
  const index = out.phrase = Math.max(0, Math.min(controlLightPhrases.length - 1, Math.floor(beat / CONTROL_PHRASE_BEATS)));
  const previous = out.previous = Math.max(0, index - 1);
  const from = controlLightPhrases[previous], to = controlLightPhrases[index];
  const blend = out.blend = ease((beat - index * CONTROL_PHRASE_BEATS) / 3);
  const mix = (a: number, b: number) => a + (b - a) * blend;
  const motion = Number(!reducedMotion);
  const level = out.amount = amount * motion * (1 - ease((beat - (controlTrack.beats - 16)) / 16));
  out.accents.fill(0);
  out.gains.set(neutralLampGains);
  const time = beat * 4 * step;
  const lastStep = reducedMotion ? -1 : Math.floor(time / step + 1e-7);
  for (let i = Math.max(0, Math.floor((time - 1.42) / step)); i <= lastStep; i++) {
    for (const { onset, rise, decay, voice, velocity } of events[i] ?? []) {
      const age = time - onset;
      if (age < 0 || age >= rise + decay) continue;
      const strength = velocity * (age < rise ? ease(age / rise) : 1 - ease((age - rise) / decay));
      if (strength > out.accents[voice]) out.accents[voice] = strength;
    }
  }
  const [kick, snare, signal, chord, metal, sweep] = out.accents;
  const energy = out.energy = mix(from.energy, to.energy) * (.76 + .24 * level);
  const roof = mix(from.motion[0], to.motion[0]), floor = mix(from.motion[1], to.motion[1]);
  const side = mix(from.motion[2], to.motion[2]), flow = mix(from.motion[3], to.motion[3]);
  const lilt = motion * Math.cos(beat * Math.PI / 4);
  const echo = motion * Math.cos((beat - 1.5) * Math.PI / 4);
  const turn = motion * Math.cos(beat * Math.PI / 2);
  const warning = mix(from.warning, to.warning);
  const gain = out.gains;
  gain[ControlLamp.Roof] += energy * (-.33 + .32 * roof + .38 * lilt + .38 * signal + .22 * kick + .16 * chord);
  gain[ControlLamp.Floor] += energy * (-.32 + .30 * floor - .36 * echo + .38 * snare + .25 * sweep + .20 * kick);
  gain[ControlLamp.Left] += energy * (.16 + .23 * snare + .25 * metal + .27 * side * turn);
  gain[ControlLamp.Right] += energy * (.16 + .27 * signal + .19 * chord - .27 * side * turn);
  gain[ControlLamp.Rail] += energy * (.20 + .38 * kick + .30 * sweep);
  gain[ControlLamp.Deck] += energy * (.23 + .32 * sweep + .24 * chord + .18 * lilt);
  gain[ControlLamp.DeepDeck] += energy * (.21 + .37 * chord + .19 * metal + .18 * echo);
  gain[ControlLamp.Stator] += (.60 + .40 * level) * (.10 - motion * (.32 + .16 * chord) * Math.cos(beat * Math.PI / 8));
  gain[ControlLamp.Alarm] += energy * warning * (.12 + .43 * metal + .30 * snare - .15 * turn);
  out.travel = level ? level * energy * flow * (.74 + .26 * Math.max(kick, sweep)) : 0;
  out.relay = level * energy * warning * (.62 + .38 * Math.max(snare, metal));
  out.rim = Math.min(.72, .18 + energy * (.16 + .14 * signal + .16 * chord + .12 * metal + .14 * level));
  out.paneGain = 1 + energy * (.05 * lilt + .12 * chord + .07 * signal);
}
