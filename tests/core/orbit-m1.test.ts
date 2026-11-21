import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { starwakeEvents, starwakeTheme, starwakeTrack, beatSeconds } from '../../app/game/core/orbit-score';
import { orbitM1Events, orbitM1Phrases, orbitM1Steps, orbitM1Track, makeOrbitM1Score } from '../../app/game/core/orbit-m1-score';
import { orbitChart, orbitRouteCharts, orbitCueBeats } from '../../app/game/core/orbit-chart';
import { originalStarwake } from '../../app/game/audio/orbit.client';
import { melodyFirstArrangement } from '../../app/game/audio/orbit-m1.client';
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
  expect(originalStarwake.melodyFirst).toBeUndefined();
  expect(volumeById('orbit').soundtrack).toBe(starwakeTrack);
  expect(inspectorScore(volumeById('orbit')).arrangement).toBe('original');
});

test('candidate owns one complete deterministic score without bass or pluck scheduling', () => {
  expect(orbitM1Track).toMatchObject({bpm:128,bars:96,beats:384,duration:180,tail:4});
  expect(orbitM1Track.sections).toBe(starwakeTrack.sections);
  expect(orbitM1Phrases).toHaveLength(24);
  expect(makeOrbitM1Score()).toEqual(orbitM1Events);
  expect(orbitM1Events.some(event => event.voice==='bass'||event.voice==='pluck')).toBe(false);
  expect(melodyFirstArrangement.events).toBe(orbitM1Events);
  expect(melodyFirstArrangement.steps).toBe(orbitM1Steps);
  expect(new Set(orbitM1Events.map(event=>event.id)).size).toBe(orbitM1Events.length);
  expect(new Set(orbitM1Events.map(event=>event.identity)).size).toBe(orbitM1Events.length);
  expect(orbitM1Steps.flat().sort((a,b)=>a-b)).toEqual(orbitM1Events.map((_,i)=>i));
  for (const [index,event] of orbitM1Events.entries()) {
    expect(event.at).toBeGreaterThanOrEqual(orbitM1Events[index-1]?.at??0);
    expect(event.at).toBeCloseTo(event.beat*beatSeconds,10);
    expect(event.bar).toBe(Math.floor(event.beat/4));
    expect(event.at).toBeLessThan(180);
    if ('length' in event) { expect(event.length).toBeGreaterThan(0); expect(event.at+event.length).toBeLessThanOrEqual(180); }
    expect(event.section).toBe(orbitM1Track.sections.find(section=>event.bar<section.endBar)!.name);
  }
  const rhythm = (events:typeof starwakeEvents) => events.filter(event=>['kick','snare','hat','perc','sweep'].includes(event.voice));
  expect(rhythm(orbitM1Events)).toEqual(rhythm(starwakeEvents));
});

test('lead previews its theme identity early, connects DRIFT and preserves ECLIPSE breathing room', () => {
  const lead = orbitM1Events.filter(event=>event.voice==='lead');
  expect(lead[0].at).toBeGreaterThanOrEqual(2);
  expect(lead[0].at).toBeLessThanOrEqual(4);
  expect(lead.slice(0,3).map(event=>event.note)).toEqual([69,72,77]);
  for (const [index,event] of lead.entries()) {
    const next=lead[index+1];
    if (!next || event.at<3 || event.at>=104&&event.at<120) continue;
    expect(next.at-event.at-event.length,`lead gap at ${event.at}`).toBeLessThan(1.1);
  }
  expect(lead.some(event=>event.at>18.38&&event.at<22.5)).toBe(true);
  for (const bar of [24,64]) expect(lead.filter(event=>event.bar>=bar&&event.bar<bar+4).map(event=>event.note))
    .toEqual(starwakeTheme.map(([,note])=>note));
  const eclipse=lead.filter(event=>event.section==='ECLIPSE');
  expect(eclipse.reduce((sum,event)=>sum+event.length,0)/15).toBeLessThan(.7);
  expect(Math.max(...eclipse.slice(1).map((event,i)=>event.at-eclipse[i].at-eclipse[i].length))).toBeGreaterThan(1);
  expect(lead.filter(event=>event.section==='AURORA').some(event=>event.note===79&&event.length>1)).toBe(true);
  expect(lead.at(-1)).toMatchObject({bar:95,note:65});
});

test('Pad supports harmony with sustained roots below a smoothly connected mid-register', () => {
  const pad=orbitM1Events.filter(event=>event.voice==='pad');
  expect(pad).toHaveLength(96);
  for (const [index,event] of pad.entries()) {
    expect(event.beat).toBe(index*4);
    expect(event.notes).toHaveLength(5);
    expect(event.notes[0]).toBeLessThanOrEqual(45);
    expect(event.notes.slice(1).every(note=>note>=48&&note<=67)).toBe(true);
    expect(event.length).toBeGreaterThan(1.7);
    if (index) expect(Math.max(...event.notes.slice(1).map((pitch,i)=>Math.abs(pitch-pad[index-1].notes[i+1])))).toBeLessThanOrEqual(7);
  }
  const candidate=inspectorScore(volumeById('orbit'),'m1');
  expect(candidate.tracks).toEqual(['master','kick','snare','hats','perc','pad','lead','sweep']);
  expect(stemMetadata(volumeById('orbit'),'m1').map(track=>track.id)).toEqual(candidate.tracks.slice(1));
  expect(inspectorScore(volumeById('descent'),'m1').arrangement).toBe('original');
});
