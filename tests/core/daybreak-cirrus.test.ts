import { expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { CIRRUS_HEIGHT, CIRRUS_WIDTH, makeDaybreakCirrusField } from '../../app/game/graphics/daybreak-cirrus';

const field = makeDaybreakCirrusField();
const sample = (column: number, row: number, channel: number) => field[(row * CIRRUS_WIDTH + column) * 4 + channel];
const column = (x: number, channel: number) => Array.from({ length: CIRRUS_HEIGHT }, (_, y) => sample(x, y, channel));

test('cirrus seeds vary fibers and leave the main and secondary geometry independently inspectable', () => {
  expect(createHash('sha256').update(field).digest('hex'))
    .toBe('cc8ea99010f9b61c91d3f028564ab9dd3d1cbf9ffebe6b11730ce4a5abcbdaa4');
  expect(Buffer.compare(field, makeDaybreakCirrusField())).toBe(0);
  const other = makeDaybreakCirrusField(51);
  expect(Buffer.compare(field, other)).not.toBe(0);
  expect(field.every((value, i) => i % 4 >= 2 || value === other[i])).toBe(true);
  expect(field.every((value, i) => i % 4 < 2 || value <= field[i - 2])).toBe(true);
});

test('the forward ribbon bends continuously with variable width and subordinate offshoots on both sides', () => {
  const ridge: number[] = [];
  const widths: number[] = [];
  for (let x = 180; x <= 340; x++) {
    const main = column(x, 0);
    const weight = main.reduce((sum, value) => sum + value, 0);
    ridge.push(main.reduce((sum, value, row) => sum + row * value, 0) / weight);
    widths.push(main.filter(value => value > 55).length);
    expect(Math.max(...main)).toBeGreaterThan(65);
    expect(Math.max(...column(x, 1))).toBeLessThan(Math.max(...main));
  }
  expect(Math.max(...ridge) - Math.min(...ridge)).toBeGreaterThan(30);
  expect(Math.max(...ridge.slice(1).map((row, i) => Math.abs(row - ridge[i])))).toBeLessThan(2);
  expect(Math.min(...widths)).toBeGreaterThan(12);
  expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(8);
  const main = column(265, 0);
  const crest = main.indexOf(Math.max(...main));
  const branches = column(265, 1);
  expect(branches.some((density, row) => row < crest && density > 35 && main[row] < 22)).toBe(true);
  expect(branches.some((density, row) => row > crest && density > 35 && main[row] < 22)).toBe(true);
  expect(Math.max(...column(400, 1))).toBeLessThan(5);
});

test('the direction texture fades at the horizon and zenith and wraps at the sky meridian', () => {
  for (const row of [0, 60, 250, CIRRUS_HEIGHT - 1]) {
    expect(field.slice(row * CIRRUS_WIDTH * 4, (row + 1) * CIRRUS_WIDTH * 4).every(value => value === 0)).toBe(true);
  }
  expect(field.every((value, i) => i % (CIRRUS_WIDTH * 4) >= 4 || value === field[i + (CIRRUS_WIDTH - 1) * 4])).toBe(true);
  expect(column(260, 0).findIndex(value => value > 0)).toBeGreaterThan(80);
});
