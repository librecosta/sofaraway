import { beatSeconds, starwakeEvents, starwakeTheme, starwakeTrack } from './orbit-score';
import type { OrbitEvent } from './orbit-score';

/** Audition only. Gameplay and its accent chart continue to consume starwakeEvents. */
export const orbitM1Track = { ...starwakeTrack, id: 'starwake-m1',
  title: 'ORBIT — STARWAKE M1 · Melody First' } as const;

type Melody = readonly (readonly [beat: number, pitch: number, beats: number])[];
const melodies: Record<string, Melody> = {
  // The first six beats remain open space; the theme arrives as a quiet invitation.
  dawn: [[6,69,2.6],[9,72,2.5],[12,77,2.4],[15,76,1]],
  unfolding: [[0,77,2.7],[3,76,2.2],[6,74,2.5],[9,72,2.7],[12,69,2.1],[14.5,67,1.2]],
  invitation: [[0,69,1.4],[1.75,72,1],[3,77,2.6],[6,76,1.6],
    [8,74,2.5],[11,72,2],[13.5,69,2.1]],
  answer: [[0,74,1.8],[2.25,72,1.3],[4,69,2.5],[7,67,.8],
    [8,70,1.7],[10.25,69,1.4],[12,67,1.7],[14,73,1.8]],
  travel: [[0,72,1.8],[2.5,74,1.1],[4,77,2.5],[7,76,.9],
    [8.5,74,2.1],[11,72,1.7],[13.25,69,2.4]],
  question: [[0,74,2.6],[3.25,72,2.4],[6.25,70,1.5],[8.5,69,2.5],
    [11.5,67,1.1],[13,73,2.7]],
  theme: starwakeTheme.map(([at,note,length]) => [at,note,
    Math.min(length + .35, (starwakeTheme.find(([next]) => next > at)?.[0] ?? 16) - at - .08)] as const),
  horizon: [[0,74,2.4],[3,72,2.5],[6,69,1.6],[8,70,2.4],
    [11,72,1.8],[13.5,74,2.3]],
  orbit: [[0,69,1.8],[2.25,72,1.3],[4,77,2.8],[7.25,76,1.2],
    [9,74,2.1],[11.5,72,1.2],[13.25,69,2.5]],
  crossing: [[0,70,2.5],[3,72,1.6],[5,74,2.6],[8,77,2.4],
    [11,74,1.6],[13,72,2.7]],
  motion: [[0,74,2.1],[2.75,72,1.5],[4.75,69,2.4],[7.75,67,1],
    [9.25,70,1.7],[11.5,69,1.2],[13.25,73,2.5]],
  turning: [[0,77,2.5],[3,74,1.8],[5.5,72,2],[8,70,2.4],
    [11,69,1.5],[13.25,73,2.5]],
  onward: [[0,72,1.5],[2,74,1.6],[4,77,2.7],[7.25,76,1.2],
    [9,74,2],[11.5,72,1.5],[13.5,69,2.2]],
  retreat: [[0,74,2.6],[3.5,72,2.2],[6.5,70,1.7],[9,69,2.6],[13,73,2.6]],
  suspended: [[1,74,3],[7,72,2.8],[12,69,3.5]],
  beacon: [[1,67,2.5],[6,69,2.8],[10.5,73,1.7],[13,76,2.9]],
  lift: [[0,74,1.7],[2,72,1.4],[4,69,2.5],[7,72,.9],
    [8.25,77,2.4],[11.25,76,1.4],[13.25,74,2.6]],
  summit: [[0,69,1.4],[1.75,72,1],[3.25,77,2.5],[6.25,76,1.4],
    [8,77,1.7],[10.25,79,2.4],[13.25,77,2.6]],
  release: [[0,77,2.6],[3.25,76,1.8],[5.5,74,2.1],[8.25,72,2.5],
    [11.25,69,1.4],[13.25,67,2.6]],
  recollection: [[0,69,2.1],[2.75,72,1],[4.25,77,3],[8.25,74,2.5],
    [11.5,72,1.2],[13.25,69,2.6]],
  landing: [[0,70,2.5],[3.25,69,2.1],[6,67,3],[10,69,2.4],[13,65,2.8]],
  coda: [[0,67,2.9],[4,69,3.2],[8,72,3],[12,65,3.8]],
};

// Open mid-register voicings leave the singing lead above them. Root is part of Pad,
// sustained once per bar, never a syncopated replacement bass line.
const chords = {
  F: [41,[53,57,60,67]], Am: [45,[52,55,57,60]], C: [36,[52,55,60,62]],
  Cs: [36,[50,55,60,62]], Bb: [34,[53,57,60,62]], Bbd: [38,[53,57,62,65]],
  Dm: [38,[53,57,60,64]], Gm: [43,[50,53,58,65]],
  Eb: [39,[51,55,58,65]], Em: [40,[52,55,58,62]],
  As: [33,[50,55,57,64]], A7: [33,[49,55,57,64]],
} as const;
type Chord = keyof typeof chords;

export const orbitM1Phrases = [
  ['F F Bb Cs','dawn'], ['F Am Bb Cs','unfolding'],
  ['F C Dm Bb','invitation'], ['Gm Cs F A7','answer'],
  ['Dm Bb F C','travel'], ['Gm Bb As A7','question'],
  ['Bb F C Dm','theme'], ['Gm Bb Cs C','horizon'],
  ['F C Dm Bb','orbit'], ['Bb F Gm Cs','crossing'],
  ['Dm Bb Gm A7','motion'], ['Bb F Gm A7','turning'],
  ['F Am Dm C','onward'], ['Bb Gm As A7','retreat'],
  ['Dm Dm Gm Gm','suspended'], ['Bb Em As A7','beacon'],
  ['Bb F C Dm','theme'], ['Gm F Bb Cs','lift'],
  ['F C Dm Bb','summit'], ['Gm Bb Cs C','release'],
  ['F C Dm Bb','orbit'], ['Gm F Bb Cs','recollection'],
  ['Dm Bb Gm C','landing'], ['Gm Cs F F','coda'],
] as const;

function connectVoicing(notes: readonly number[], previous: readonly number[]) {
  let best = [...notes], cost = Infinity;
  function visit(index: number, voicing: number[]) {
    if (index === notes.length) {
      const sorted = [...voicing].sort((a,b) => a-b);
      if (sorted.some((pitch,i) => i > 0 && pitch - sorted[i-1] < 2)) return;
      const distance = sorted.reduce((sum,pitch,i) => sum + (pitch - (previous[i] ?? notes[i])) ** 2, 0);
      if (distance < cost) { best = sorted; cost = distance; }
      return;
    }
    for (const pitch of [notes[index]-12,notes[index],notes[index]+12])
      if (pitch >= 48 && pitch <= 67) visit(index+1,[...voicing,pitch]);
  }
  visit(0,[]);
  return best;
}

export function makeOrbitM1Score(): OrbitEvent[] {
  // Retain original IDs, velocities and noise seeds for every untouched rhythm/FX event.
  const events = starwakeEvents.filter(event => !['bass','pluck','lead','pad'].includes(event.voice));
  let next = Math.max(...starwakeEvents.map(event => event.id)) + 1, previous: number[] = [];
  function put(beat: number, voice: 'lead' | 'pad', velocity: number, detail: object) {
    const bar = Math.floor(beat/4), section = orbitM1Track.sections.find(part => bar < part.endBar)!;
    const id = next++;
    events.push({ id, identity:`starwake-m1:${id}`, voice, bar, beat, at:beat*beatSeconds,
      velocity, section:section.name, accent:voice==='lead' && beat%4===0,
      fill:false, transition:false, ...detail } as OrbitEvent);
  }
  for (const [phrase,[changes,motif]] of orbitM1Phrases.entries()) {
    const bar = phrase*4, eclipse = bar>=56 && bar<64, aurora = bar>=64 && bar<80;
    for (const [cell,name] of changes.split(' ').entries()) {
      const [root,notes] = chords[name as Chord];
      previous = connectVoicing(notes,previous);
      const current = bar+cell;
      const velocity = current<4 ? .32 : current<8 ? .37 : eclipse ? .34 : aurora ? .49 : current>=92 ? .37 : .44;
      put(current*4,'pad',velocity,{ notes:[root,...previous],
        length:(current===95 ? 3.8 : 3.7)*beatSeconds,
        color:aurora ? .70 : eclipse ? .25 : current<8 ? .32 : .46 });
    }
    for (const [i,[at,note,length]] of melodies[motif].entries()) {
      const velocity = bar<8 ? .45 + i%2*.025 : eclipse ? .49 : aurora ? .79 : bar>=88 ? .59 : .68;
      put(bar*4+at,'lead',velocity,{ note,length:length*beatSeconds,motif:`m1-${motif}`,pan:.04 });
    }
  }
  return events.sort((a,b) => a.at-b.at || a.voice.localeCompare(b.voice));
}

export const orbitM1Events = makeOrbitM1Score();
const steps: number[][] = Array.from({length:orbitM1Track.bars*16},()=>[]);
for (const [index,event] of orbitM1Events.entries()) steps[Math.floor(event.beat*4+1e-8)].push(index);
export const orbitM1Steps: readonly (readonly number[])[] = steps;
