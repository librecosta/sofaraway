import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { starwakeEvents, starwakeTheme, starwakeTrack, beatSeconds } from '../../app/game/core/orbit-score';
import { orbitM1Events, orbitM1Repairs, orbitM1Steps, orbitM1Track, makeOrbitM1Score } from '../../app/game/core/orbit-m1-score';
import { orbitChart, orbitRouteCharts, orbitCueBeats } from '../../app/game/core/orbit-chart';
import { originalStarwake } from '../../app/game/audio/orbit.client';
import { originalLeadArrangement } from '../../app/game/audio/orbit-m1.client';
import { inspectorScore, stemMetadata } from '../../app/game/debug/audio/track-adapter';
import { volumeById } from '../../app/game/core/volumes';
import type { Difficulty } from '../../app/game/contracts';

const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('M1 leaves the 9bca263 production score, chart, cues and default arrangement intact', () => {
  expect(hash(starwakeEvents)).toBe('aaa59b7b41ac586a5cc941ffe3158c585042334f16a8eedb5a0bec076f4661fc');
  const charts = Object.fromEntries((['easy','normal','hard','impossible'] as Difficulty[])
    .map(d => [d,{main:orbitChart(d),routes:orbitRouteCharts(orbitChart(d),d)}]));
  expect(hash(charts)).toBe('e4f411e7a91e3f0d5b8f2f3ec43d32063a6223fc3eb85bf7f580c026057c0877');
  expect(hash(orbitCueBeats)).toBe('0423d862a547e4929544c79ece3ea2b596b2260e2dc7a130f94c633488b6ef1d');
  expect(originalStarwake.events).toBe(starwakeEvents);
  expect(volumeById('orbit').soundtrack).toBe(starwakeTrack);
  expect(inspectorScore(volumeById('orbit')).arrangement).toBe('original');
});

test('F1 preserves every original non-backing event, with all attributes and relative order', () => {
  const before = JSON.stringify(starwakeEvents);
  const retained = starwakeEvents.filter(event => event.voice !== 'bass' && event.voice !== 'pluck');
  const originalIds = new Set(starwakeEvents.map(event => event.id));
  const actual = orbitM1Events.filter(event => originalIds.has(event.id));
  expect(actual).toEqual(retained);
  for (const [index, event] of actual.entries()) expect(event).toBe(retained[index]);
  for (const voice of ['lead', 'pad'] as const)
    expect(orbitM1Events.filter(event => event.voice === voice && originalIds.has(event.id)))
      .toEqual(starwakeEvents.filter(event => event.voice === voice));
  expect(orbitM1Events.some(event => event.voice === 'bass' || event.voice === 'pluck')).toBe(false);
  expect(makeOrbitM1Score()).toEqual(orbitM1Events);
  expect(JSON.stringify(starwakeEvents)).toBe(before);
  expect(originalLeadArrangement).toEqual({ events: orbitM1Events, steps: orbitM1Steps });
});

test('F1 adds exactly five quiet theme quotations only inside the approved gaps', () => {
  const originalIds = new Set(starwakeEvents.map(event => event.id));
  const added = orbitM1Events.filter(event => !originalIds.has(event.id));
  expect(added).toEqual(orbitM1Repairs);
  expect(added).toHaveLength(5);
  expect(added.map(event => [event.at, 'note' in event ? event.note : null])).toEqual([
    [2.8125, 69], [4.21875, 72], [5.625, 77], [18.75, 72], [20.625, 69],
  ]);
  for (const event of added) {
    expect(event.voice).toBe('lead');
    expect(event.id).toBeGreaterThan(Math.max(...originalIds));
    expect(event.identity).toMatch(/^starwake-m1-f1:repair:/);
    expect(event.velocity).toBeLessThan(.4);
    expect('note' in event && starwakeTheme.some(([, note]) => note === event.note)).toBe(true);
    const window = [[0, 8.44], [10.4, 12.66], [18.38, 22.5]].find(([a,b]) => event.at >= a && event.at < b)!;
    expect(window).toBeDefined();
    if ('length' in event) expect(event.at + event.length).toBeLessThan(window[1]);
  }
  // No rewritten ECLIPSE melody, harmony or added sustained root in any section.
  expect(orbitM1Events.filter(event => event.section === 'ECLIPSE'))
    .toEqual(starwakeEvents.filter(event => event.section === 'ECLIPSE' && event.voice !== 'bass' && event.voice !== 'pluck'));
  expect(orbitM1Events.filter(event => event.voice === 'pad')).toEqual(starwakeEvents.filter(event => event.voice === 'pad'));
  expect(new Set(orbitM1Events.map(event => event.id)).size).toBe(orbitM1Events.length);
  expect(new Set(orbitM1Events.map(event => event.identity)).size).toBe(orbitM1Events.length);
});

test('F1 retains the full timeline, exact scheduler positions and seven real stems', () => {
  expect(orbitM1Track).toMatchObject({ bpm:128, bars:96, beats:384, duration:180, tail:4 });
  expect(orbitM1Track.sections).toBe(starwakeTrack.sections);
  expect(orbitM1Steps.flat().sort((a,b) => a-b)).toEqual(orbitM1Events.map((_,i) => i));
  for (const [index, event] of orbitM1Events.entries()) {
    expect(event.at).toBeGreaterThanOrEqual(orbitM1Events[index-1]?.at ?? 0);
    expect(event.at).toBe(event.beat * beatSeconds);
    expect(event.bar).toBe(Math.floor(event.beat / 4));
    expect(orbitM1Steps[Math.floor(event.beat * 4 + 1e-8)]).toContain(index);
    if ('length' in event) {
      expect(event.length).toBeGreaterThan(0);
      expect(event.at + event.length).toBeLessThanOrEqual(180);
    }
  }
  const candidate = inspectorScore(volumeById('orbit'), 'm1');
  expect(candidate.tracks).toEqual(['master','kick','snare','hats','perc','pad','lead','sweep']);
  expect(stemMetadata(volumeById('orbit'), 'm1').map(track => track.id)).toEqual(candidate.tracks.slice(1));
  expect(inspectorScore(volumeById('descent'), 'm1').arrangement).toBe('original');
});
