import { sections } from '../core/daybreak-score';
import { ease } from '../core/lighting-score';

type Palette = readonly [brightness: number, blue: number, warmth: number, haze: number, coverage: number];

// The seven looks share the music timeline rather than the traversal clock.
const palette = {
  OPEN:     [.91, .14, .43, .82, .67],
  GLIDE:    [1.00, .65, .48, .61, .64],
  LIFT:     [1.05, .74, .66, .56, .69],
  BREEZE:   [1.02, .97, .53, .35, .59],
  SUNBURST: [1.12, .85, .88, .50, .72],
  RETURN:   [1.06, .82, .61, .44, .64],
  OUTRO:    [1.10, .70, .81, .59, .66],
} satisfies Record<typeof sections[number]['name'], Palette>;

const keyframes = sections.map(({ name, startBeat, endBeat }) => ({
  beat: (startBeat + endBeat) / 2,
  values: palette[name],
}));

export const DAYBREAK_MENU_BEAT = keyframes[1].beat;
export const CLOUD_CLEARANCE = 22;
export const CLOUD_RELIEF = 16;

export function daybreakAtmosphere(beat: number, out = new Float32Array(5)) {
  const next = keyframes.findIndex(key => beat < key.beat);
  const a = keyframes[next < 0 ? keyframes.length - 1 : Math.max(0, next - 1)];
  const b = next < 0 ? a : keyframes[next];
  const blend = a === b ? 0 : ease((beat - a.beat) / (b.beat - a.beat));
  for (let i = 0; i < out.length; i++) out[i] = a.values[i] + (b.values[i] - a.values[i]) * blend;
  return out;
}
