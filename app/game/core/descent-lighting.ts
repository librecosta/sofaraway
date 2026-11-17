import { controlEvents, controlSteps, controlTrack, step } from './descent-score';
import { breath, ease } from './lighting-score';

export const CONTROL_PHRASE_BEATS = 16;
export const enum ControlLamp { Roof, Floor, Left, Right, Rail, Deck, DeepDeck, Stator, Alarm, Route }
export const controlLampCount = 10;
export type ControlLightView = 'all' | 'roof' | 'floor' | 'left' | 'right' | 'glass';

const palette = {
  white: 0xdce8f4, steel: 0x8daccb, frost: 0xaedafb, ice: 0x75dffa, cyan: 0x44cee0,
  blue: 0x769afb, violet: 0x9b8ff5, lilac: 0xc1a5fc, magenta: 0xe482cb, rose: 0xf487a4,
  amber: 0xffc478, copper: 0xff975e, red: 0xff674c,
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
  phrase('Pilot signal',     'frost', 'ice',   'ice',     'cyan',   'ceiling', .27),
  // LOCK
  phrase('Ceiling scan',     'ice',   'frost', 'cyan',    'blue',   'ceiling', .54),
  phrase('Side relay',       'white', 'ice',   'blue',    'lilac',  'answer',  .61),
  phrase('Floor interlock',  'frost', 'blue',  'ice',     'violet', 'floor',   .72),
  phrase('Reset circuit',    'white', 'steel', 'ice',     'frost',  'steady',  .51),
  // FLIGHT
  phrase('Rail ignition',    'ice',   'frost', 'cyan',    'blue',   'forward', .64),
  phrase('Transfer pulse',   'frost', 'blue',  'blue',    'lilac',  'forward', .82),
  phrase('Counterflow',      'blue',  'ice',   'violet',  'cyan',   'reverse', .91),
  phrase('Turnout',          'frost', 'blue',  'steel',   'lilac',  'answer',  .55),
  phrase('Exit conveyor',    'ice',   'steel', 'cyan',    'violet', 'forward', .74),
  // PRESSURE
  phrase('Shaft descent',    'blue',  'steel', 'violet',  'lilac',  'depth',   .64),
  phrase('Platform echoes',  'lilac', 'blue',  'blue',    'magenta','answer',  .73),
  phrase('Deep relay',       'violet','frost', 'magenta', 'blue',   'reverse', .83),
  phrase('Load transfer',    'blue',  'lilac', 'violet',  'rose',   'depth',   .89),
  phrase('Residual heat',    'lilac', 'steel', 'magenta', 'copper', 'floor',   .78),
  // HOLD
  phrase('Stator idle',      'steel', 'frost', 'steel',   'ice',    'stator',  .13),
  phrase('Precharge',        'frost', 'steel', 'blue',    'lilac',  'stator',  .23),
  // LOCKDOWN
  phrase('Interlocks armed', 'white', 'amber', 'copper',  'amber',  'armed',   .82, .62),
  phrase('Red relay',        'frost', 'copper','amber',   'red',    'relay',   .95, .87),
  phrase('Lock cascade',     'white', 'amber', 'red',     'copper', 'chase',   1,   1),
  phrase('Hold the line',    'frost', 'copper','copper',  'red',    'relay',   .79, .72),
  // BREACH
  phrase('Pressure release', 'ice',   'steel', 'steel',   'cyan',   'release', .43),
  phrase('Open air',         'white', 'frost', 'steel',   'ice',    'steady',  .17),
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
  return { phrase: 0, previous: 0, blend: 0, amount: 0, beat: 0, travel: 0, relay: 0, rim: 0,
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
  out.travel = out.relay = out.rim = 0;
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
  const energy = level * mix(from.energy, to.energy);
  const roof = mix(from.motion[0], to.motion[0]), floor = mix(from.motion[1], to.motion[1]);
  const side = mix(from.motion[2], to.motion[2]), flow = mix(from.motion[3], to.motion[3]);
  const lilt = 2 * breath(beat, 8) - 1;
  const echo = 2 * breath(beat - 1.5, 8) - 1;
  const reply = side * (.55 + .45 * lilt);
  const warning = mix(from.warning, to.warning);
  const gain = out.gains;
  gain[ControlLamp.Roof] += energy * (.16 * roof + .14 * signal + .10 * chord + .055 * lilt);
  gain[ControlLamp.Floor] += energy * (.15 * floor + .15 * snare + .14 * sweep + .063 * echo);
  gain[ControlLamp.Left] += energy * (.23 * snare + .13 * metal + .14 * reply);
  gain[ControlLamp.Right] += energy * (.24 * signal + .12 * chord - .14 * reply);
  gain[ControlLamp.Rail] += energy * (.18 * kick + .17 * sweep + .11 * Math.abs(flow));
  gain[ControlLamp.Deck] += energy * (.19 * sweep + .15 * chord + .09 * lilt);
  gain[ControlLamp.DeepDeck] += energy * (.14 * chord + .13 * metal + .10 * echo);
  gain[ControlLamp.Stator] -= level * (.22 + .12 * chord) * Math.cos(beat * Math.PI / 7);
  gain[ControlLamp.Alarm] += energy * warning * (.11 + .31 * metal + .22 * snare);
  out.travel = energy * flow * (.62 + .38 * Math.max(kick, sweep));
  out.relay = energy * warning * (.44 + .56 * Math.max(snare, metal));
  out.rim = level * (.22 + mix(from.energy, to.energy) * (.11 * signal + .09 * chord + .07 * metal));
}
