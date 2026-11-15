import { expect, test } from 'vitest';
import { sections } from '../../app/game/core/daybreak-score';
import { gameplayFor } from '../../app/game/core/gameplay';
import { SECTION } from '../../app/game/core/section';
import { volumeById } from '../../app/game/core/volumes';
import { CLOUD_CLEARANCE, CLOUD_RELIEF, DAYBREAK_MENU_BEAT, daybreakAtmosphere } from '../../app/game/graphics/daybreak-atmosphere';
import { buildRunPath } from '../../app/game/graphics/path';

test('the seven official chapter looks interpolate continuously on the score beat', () => {
  const looks = sections.map(({ startBeat, endBeat }) => daybreakAtmosphere((startBeat + endBeat) / 2));
  expect(new Set(looks.map(look => look.join(','))).size).toBe(7);
  expect(daybreakAtmosphere(DAYBREAK_MENU_BEAT)).toEqual(looks[1]);
  expect(Math.min(...looks.map(look => look[3]))).toBe(looks[3][3]); // BREEZE has the clearest air.
  expect(Math.max(...looks.map(look => look[2]))).toBe(looks[4][2]); // SUNBURST has the warmest light.
  expect(looks[6][0]).toBeGreaterThan(looks[5][0]);
  for (let beat = 0; beat < 288; beat += 1 / 8) {
    const before = daybreakAtmosphere(beat), after = daybreakAtmosphere(beat + 1 / 8);
    expect(Array.from(before).every(Number.isFinite)).toBe(true);
    expect(Math.max(...after.map((value, i) => Math.abs(value - before[i])))).toBeLessThan(.004);
  }
});

test('cloud crests clear the DAYBREAK cabin and elevated branches on both paths', () => {
  const volume = volumeById('daybreak');
  for (const mode of ['standard', 'sightseeing'] as const) {
    const path = buildRunPath(volume, mode);
    const floor = Math.min(...path.frames.map(({ p }) => p.y)) - SECTION.b;
    const crest = floor + SECTION.b - CLOUD_CLEARANCE + CLOUD_RELIEF / 2;
    expect(gameplayFor(volume.id).branch!.rise).toBeGreaterThan(0);
    expect(floor - crest).toBeGreaterThan(10);
  }
});
