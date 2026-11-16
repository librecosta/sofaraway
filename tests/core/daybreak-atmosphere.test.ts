import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { sections } from '../../app/game/core/daybreak-score';
import { gameplayFor } from '../../app/game/core/gameplay';
import { SECTION } from '../../app/game/core/section';
import { volumeById } from '../../app/game/core/volumes';
import { CLOUD_CLEARANCE, CLOUD_RELIEF, DAYBREAK_MENU_BEAT, daybreakAtmosphere } from '../../app/game/graphics/daybreak-atmosphere';
import { CLOUD_FIELD_SIZE, makeDaybreakCloudField } from '../../app/game/graphics/daybreak-cloud-field';
import { buildRunPath } from '../../app/game/graphics/path';

test('the seven official chapter looks interpolate continuously on the score beat', () => {
  const looks = sections.map(({ startBeat, endBeat }) => daybreakAtmosphere((startBeat + endBeat) / 2));
  expect(new Set(looks.map(look => look.join(','))).size).toBe(7);
  expect(daybreakAtmosphere(DAYBREAK_MENU_BEAT)).toEqual(looks[1]);
  expect(looks[1][0]).toBeGreaterThan(1.04); // Full daylight arrives early in the score.
  expect(looks[1][2]).toBeGreaterThan(looks[0][2]);
  expect(Math.max(...looks.map(look => look[0]))).toBe(looks[4][0]);
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

test('cloud banks retain the accepted RGB field and their slopes wrap at the texture seam', () => {
  const size = CLOUD_FIELD_SIZE;
  const field = makeDaybreakCloudField();
  expect(field).toEqual(makeDaybreakCloudField());
  expect(field).not.toEqual(makeDaybreakCloudField(12));
  expect(createHash('sha256').update(field.filter((_, index) => index % 4 < 3)).digest('hex'))
    .toBe('7a6cb8756a90e4cc53821af37d7736e1ff3b54cd8ef45dbb72c386b9ed384c70');
  const channel = (x: number, z: number, c: number) =>
    field[(((z + size) % size) * size + (x + size) % size) * 4 + c];
  const validateSlope = (normal: number, from: number, to: number) => {
    const expected = Math.max(0, Math.min(255, 127.5 + .94 * (from - to)));
    expect(Math.abs(normal - expected)).toBeLessThanOrEqual(1.5);
  };
  for (let i = 0; i < size; i++) {
    for (const seam of [0, size - 1]) {
      validateSlope(channel(seam, i, 1), channel(seam - 1, i, 0), channel(seam + 1, i, 0));
      validateSlope(channel(i, seam, 2), channel(i, seam - 1, 0), channel(i, seam + 1, 0));
    }
  }
  let valley = 0, bank = 0, seamDelta = 0, adjacentDelta = 0;
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const height = channel(x, z, 0);
    if (height < 35) valley++;
    if (height > 190) bank++;
    const delta = Math.abs(height - channel(x - 1, z, 0)) + Math.abs(height - channel(x, z - 1, 0));
    adjacentDelta += delta;
    if (x === 0) seamDelta += Math.abs(height - channel(x - 1, z, 0));
    if (z === 0) seamDelta += Math.abs(height - channel(x, z - 1, 0));
  }
  expect(valley).toBeGreaterThan(size * size * .16);
  expect(bank).toBeGreaterThan(size * size * .12);
  expect(seamDelta / size).toBeLessThan(1.2 * adjacentDelta / (size * size));
});
