import { STEP } from './clock';

export const CRUISE_SPEED = 24;
export const SPEED_BONUS = 10;
export const CRUISE_RESPONSE = 1.6;
export const BOOST_MULTIPLIER = 1.45;
export const cruiseTarget = (count: number) => CRUISE_SPEED + Math.min(count * .22, SPEED_BONUS);

/** Integrate the authored reference speed with the same step used to place gates. */
export function referenceMotion(beats: number, secondsPerBeat: number, gates: readonly { beat: number }[]) {
  const samples = new Float64Array(Math.ceil(beats * secondsPerBeat / STEP) + 1);
  let speed = CRUISE_SPEED, count = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const beat = i * STEP / secondsPerBeat;
    while (gates[count]?.beat <= beat + 1e-9) count++;
    speed += (cruiseTarget(count) - speed) * CRUISE_RESPONSE * STEP;
    samples[i + 1] = samples[i] + speed * STEP;
  }
  return (beat: number) => {
    const tick = Math.min(samples.length - 1, Math.max(0, beat * secondsPerBeat / STEP));
    const index = Math.floor(tick);
    const start = samples[index];
    return start + ((samples[index + 1] ?? start) - start) * (tick - index);
  };
}
