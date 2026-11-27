import { expect, test } from 'vitest';
import { STEP } from '../../app/game/core/clock';
import { facilityZones } from '../../app/game/core/descent-facility';
import { idleInput } from '../../app/game/core/input';
import { referenceFor, START_DISTANCE } from '../../app/game/core/reference-track';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

test.each(['daybreak', 'descent'] as const)('%s Impossible cruise reaches the physical chapter cues on the music grid', id => {
  const volume = volumeById(id);
  const sim = new Simulation(volume, { align: true });
  sim.start('impossible', 0);
  const track = sim.reference;
  const junction = sim.junctionPath!;
  expect(sim.path.reference).toBe(track);
  expect(junction.base).toBe(sim.path);
  expect(junction.split - junction.guideStart).toBeGreaterThanOrEqual(56.695 * 1.8 - 1e-9);
  const chapterBeats = volume.sections.map((_, i) => volume.sections.slice(0, i).reduce((beat, section) => beat + section.beats, 0));
  const chapterStations = id === 'descent' ? facilityZones(volume, 'standard', track).slice(1).map(zone => zone.start)
    : chapterBeats.slice(1).map(beat => track.station(beat, 'standard'));
  const cues = [
    ...chapterBeats.slice(1).map((beat, i) => ({ beat, station: chapterStations[i] })),
    { beat: junction.spec.preview, station: junction.start },
    { beat: junction.spec.split, station: junction.split },
    { beat: junction.spec.rejoin, station: junction.end },
  ].sort((a, b) => a.beat - b.beat);
  for (const { beat, station } of cues) {
    while (sim.phase === 'playing' && sim.trackDistance < station) sim.step(STEP, idleInput);
    expect(Math.abs(sim.beat - beat), `${id} at beat ${beat}`).toBeLessThan(.12);
    const standard = referenceFor(volume).station(beat, 'standard');
    expect(station).toBeCloseTo(START_DISTANCE + 1.15 * (standard - START_DISTANCE), 8);
  }
  expect(sim.route).toBe('main');
  const impossiblePath = sim.path;
  sim.returnToMenu();
  sim.start('hard', 0);
  const standardPath = sim.path;
  expect(standardPath).not.toBe(impossiblePath);
  expect(sim.reference).toBe(referenceFor(volume));
  sim.returnToMenu();
  sim.start('impossible', 0);
  expect(sim.path).toBe(impossiblePath);
  sim.returnToMenu();
  sim.start('impossible', 0, undefined, 'sightseeing');
  expect(sim.reference).toBe(referenceFor(volume));
  expect(sim.path).not.toBe(impossiblePath);
});

test('ELSEWHERE Impossible uses the original world landmarks and legacy Encore', () => {
  const sim = new Simulation(volumeById('elsewhere'));
  sim.start('hard', 0);
  const track = sim.reference, path = sim.path, split = sim.junctionPath!.split;
  sim.returnToMenu();
  sim.start('impossible', 0);
  expect(sim.reference).toBe(track);
  expect(sim.path).toBe(path);
  expect(sim.junctionPath!.split).toBe(split);
  expect(sim.outroPlan!.gates).toHaveLength(36);
});

test.each(['daybreak', 'descent'] as const)('%s keeps the same relative Boost advance through the music cues', id => {
  const volume = volumeById(id);
  const hard = new Simulation(volume, { align: true }), impossible = new Simulation(volume, { align: true });
  hard.start('hard', 0);
  impossible.start('impossible', 0);
  for (const pattern of ['held', 'intermittent']) {
    for (let frame = 0; hard.phase === 'playing' && impossible.phase === 'playing'; frame++) {
      const input = { ...idleInput, boosting: pattern === 'held' || frame % 240 < 100 };
      hard.step(STEP, input);
      impossible.step(STEP, input);
      if (frame % 60 === 0) {
        expect(impossible.beat).toBeCloseTo(hard.beat, 8);
        expect(impossible.trackDistance - START_DISTANCE).toBeCloseTo((hard.trackDistance - START_DISTANCE) * 1.15, 6);
      }
    }
    expect(hard.result?.title).toBe('ESCAPED');
    expect(impossible.result?.title).toBe('ESCAPED');
    hard.returnToMenu();
    impossible.returnToMenu();
    hard.start('hard', 0);
    impossible.start('impossible', 0);
  }
});
