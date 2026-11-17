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

function phrase(label: string, roof: Tint, floor: Tint, sides: Tint, accent: Tint,
  gesture: keyof typeof gestures, energy: number, warning = 0) {
  return { label, colors: [
    palette[roof], palette[floor], palette[sides], palette[gesture === 'steady' ? sides : accent],
    palette[sides], palette[accent], palette[sides], palette[accent], palette[accent], 0xffffff,
  ], rim: palette[accent], motion: gestures[gesture], energy, warning };
}

export const controlLightPhrases = [
  // ORDER
  phrase('Idle circuit',     'white', 'frost', 'steel',   'frost',  'steady',  .12),
  phrase('Pilot signal',     'frost', 'cyan',  'ice',     'blue',   'ceiling', .34),
  // LOCK
  phrase('Ceiling scan',     'cyan',  'blue',  'ice',     'violet', 'ceiling', .78),
  phrase('Side relay',       'blue',  'ice',   'cyan',    'lilac',  'answer',  .81),
  phrase('Floor interlock',  'violet','cyan',  'blue',    'lilac',  'floor',   .86),
  phrase('Reset circuit',    'ice',   'violet','blue',    'cyan',   'answer',  .73),
  // FLIGHT
  phrase('Rail ignition',    'blue',  'cyan',  'cyan',    'violet', 'forward', .81),
  phrase('Transfer pulse',   'cyan',  'violet','blue',    'lilac',  'forward', .93),
  phrase('Counterflow',      'blue',  'cyan',  'violet',  'ice',    'reverse', .96),
  phrase('Turnout',          'frost', 'blue',  'steel',   'lilac',  'answer',  .55),
  phrase('Exit conveyor',    'cyan',  'blue',  'violet',  'ice',    'forward', .87),
  // PRESSURE
  phrase('Shaft descent',    'blue',  'violet','cyan',    'lilac',  'depth',   .75),
  phrase('Platform echoes',  'lilac', 'blue',  'blue',    'magenta','answer',  .89),
  phrase('Deep relay',       'violet','magenta','magenta','ice',    'reverse', .94),
  phrase('Load transfer',    'magenta','lilac','violet',  'rose',   'depth',   .96),
  phrase('Residual heat',    'rose',  'blue',  'magenta', 'copper', 'floor',   .80),
  // HOLD
  phrase('Stator idle',      'ice',   'blue',  'steel',   'cyan',   'stator',  .22),
  phrase('Precharge',        'lilac', 'ice',   'blue',    'violet', 'stator',  .38),
  // LOCKDOWN
  phrase('Interlocks armed', 'amber', 'red',   'copper',  'red',    'armed',   .90, .72),
  phrase('Red relay',        'red',   'amber', 'amber',   'red',    'relay',   .99, .93),
  phrase('Lock cascade',     'copper','red',   'red',     'amber',  'chase',   1,   1),
  phrase('Hold the line',    'red',   'amber', 'copper',  'red',    'relay',   .88, .78),
  // BREACH
  phrase('Pressure release', 'cyan',  'ice',   'steel',   'cyan',   'release', .64),
  phrase('Open air',         'white', 'cyan',  'steel',   'ice',    'release', .33),
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
  return { phrase: 0, previous: 0, blend: 0, amount: 0, beat: 0, energy: 0, travel: 0, relay: 0, rim: 0,
    accents: new Float32Array(6), gains: Float32Array.from(neutralLampGains) };
}

export function controlLightingAt(beat: number, amount: number, out: ControlLighting) {
  out.beat = beat;
  const index = out.phrase = Math.max(0, Math.min(controlLightPhrases.length - 1, Math.floor(beat / CONTROL_PHRASE_BEATS)));
  const previous = out.previous = Math.max(0, index - 1);
  const from = controlLightPhrases[previous], to = controlLightPhrases[index];
  const blend = out.blend = ease((beat - index * CONTROL_PHRASE_BEATS) / 3);
  const mix = (a: number, b: number) => a + (b - a) * blend;
  const level = out.amount = amount * (1 - ease((beat - (controlTrack.beats - 16)) / 16));
  out.accents.fill(0);
  out.gains.set(neutralLampGains);
  out.energy = out.travel = out.relay = out.rim = 0;
  if (!level) return;

  const time = beat * 4 * step;
  for (let i = Math.max(0, Math.floor((time - 1.42) / step)); i <= Math.floor(time / step + 1e-7); i++) {
    for (const { onset, rise, decay, voice, velocity } of events[i] ?? []) {
      const age = time - onset;
      if (age < 0 || age >= rise + decay) continue;
      const strength = velocity * (age < rise ? ease(age / rise) : 1 - ease((age - rise) / decay));
      if (strength > out.accents[voice]) out.accents[voice] = strength;
    }
  }
  const [kick, snare, signal, chord, metal, sweep] = out.accents;
  const energy = out.energy = level * mix(from.energy, to.energy);
  const roof = mix(from.motion[0], to.motion[0]), floor = mix(from.motion[1], to.motion[1]);
  const side = mix(from.motion[2], to.motion[2]), flow = mix(from.motion[3], to.motion[3]);
  const lilt = Math.cos(beat * Math.PI / 4);
  const echo = Math.cos((beat - 1.5) * Math.PI / 4);
  const turn = Math.cos(beat * Math.PI / 2);
  const warning = mix(from.warning, to.warning);
  const gain = out.gains;
  gain[ControlLamp.Roof] += energy * (-.33 + .32 * roof + .38 * lilt + .38 * signal + .22 * kick + .16 * chord);
  gain[ControlLamp.Floor] += energy * (-.32 + .30 * floor - .36 * echo + .38 * snare + .25 * sweep + .20 * kick);
  gain[ControlLamp.Left] += energy * (.16 + .23 * snare + .25 * metal + .27 * side * turn);
  gain[ControlLamp.Right] += energy * (.16 + .27 * signal + .19 * chord - .27 * side * turn);
  gain[ControlLamp.Rail] += energy * (.20 + .38 * kick + .30 * sweep);
  gain[ControlLamp.Deck] += energy * (.23 + .32 * sweep + .24 * chord + .18 * lilt);
  gain[ControlLamp.DeepDeck] += energy * (.21 + .37 * chord + .19 * metal + .18 * echo);
  gain[ControlLamp.Stator] += level * (.10 - (.32 + .16 * chord) * Math.cos(beat * Math.PI / 8));
  gain[ControlLamp.Alarm] += energy * warning * (.12 + .43 * metal + .30 * snare - .15 * turn);
  out.travel = energy * flow * (.74 + .26 * Math.max(kick, sweep));
  out.relay = energy * warning * (.62 + .38 * Math.max(snare, metal));
  out.rim = level * Math.min(.72, .18 + energy * (.27 + .17 * signal + .17 * chord + .14 * metal));
}
