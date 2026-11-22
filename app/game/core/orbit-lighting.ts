import { starwakeEvents, starwakeTrack, beatSeconds } from './orbit-score';
import { ease } from './lighting-score';

export const orbitLightScenes = ['First Light','Twin Shadows','Shattered Resonance','Cosmic Turbulence',
  'The Silent Occultation','Celestial Bloom','The Long Farewell'] as const;
// Key, fill, ambient, nebula, key warmth, fill violet. These are slow targets,
// never kick multipliers. The neutral rig remains available at every station.
const chapters = [
  [.88,.95,.98,.80,1,0], [1.04,1.12,1.03,.92,.86,.12], [1.16,1.06,1.06,1.06,.58,.20],
  [1.08,.96,.95,.94,.34,.62], [.66,.75,.88,.70,.68,.26], [1.10,1.18,1.10,1.52,.66,.38],
  [.91,1.04,1.01,.90,.90,.14],
] as const;
export const orbitLightVoices = ['lead','pad','sweep','kick','snare','perc'] as const;
type LightVoice = typeof orbitLightVoices[number];
type Cue = { id:number; voice:number; start:number; attack:number; hold:number; release:number; velocity:number; pitch:number };
const cues:Cue[] = starwakeEvents.flatMap(event=>{
  const voice=orbitLightVoices.indexOf(event.voice as LightVoice);
  if(voice<0)return [];
  const length='length' in event?event.length/beatSeconds:0;
  const attack=voice===0?.65:voice===1?2.5:voice===2?1.0:voice===3?.18:.24;
  return [{id:event.id,voice,start:event.beat,attack,hold:Math.max(attack,length),
    release:voice===0?2.3:voice===1?3.2:voice===2?2.0:voice===3?1.2:1.6,
    velocity:event.velocity,pitch:'note' in event?(event.note-65)/14:'color' in event?event.color:.5}];
});
// Each bucket contains only envelopes overlapping that beat, including sustain
// and release. Seeking and frame rate never change the result or replay attacks.
const buckets:Cue[][]=Array.from({length:starwakeTrack.beats+17},()=>[]);
for(const cue of cues)for(let beat=Math.max(0,Math.floor(cue.start));beat<=Math.min(buckets.length-1,Math.ceil(cue.start+cue.hold+cue.release));beat++)
  buckets[beat].push(cue);
export const orbitLightCueIds=cues.map(cue=>cue.id);
export const orbitLightBucketLimit=Math.max(...buckets.map(bucket=>bucket.length));
export interface OrbitLightOptions { amount?:number; reducedMotion?:boolean }
export function newOrbitLighting(){return {beat:0,chapter:0,phrase:0,amount:0,motion:0,key:1,fill:1,ambient:1,
  warmth:1,violet:0,sky:0,corona:1,planet:1,travel:0,ring:0,storm:0,face:0,tail:1,
  envelopes:new Float32Array(6),nebula:new Float32Array(6).fill(1),hues:new Float32Array(6),fiber:0};}
export type OrbitLighting=ReturnType<typeof newOrbitLighting>;
export function orbitLightingAt(position:number,options:OrbitLightOptions={},out=newOrbitLighting()):OrbitLighting {
  const beat=out.beat=Math.max(0,Math.min(starwakeTrack.beats+16,Number.isFinite(position)?position:0));
  const amount=out.amount=Math.max(0,Math.min(1,Number.isFinite(options.amount??1)?options.amount??1:0));
  const reduced=!!options.reducedMotion,tail=out.tail=1-ease((beat-368)/16);
  out.motion=amount*Number(!reduced)*tail;
  let chapter=0;
  while(chapter<6&&beat>=starwakeTrack.sections[chapter+1].startBeat-8)chapter++;
  const current=chapters[chapter],previous=chapters[Math.max(0,chapter-1)];
  const blend=chapter?ease((beat-starwakeTrack.sections[chapter].startBeat+8)/16):1;
  const mix=(i:number)=>previous[i]+(current[i]-previous[i])*blend;
  out.chapter=starwakeTrack.sections.findIndex(section=>beat<section.endBeat);if(out.chapter<0)out.chapter=6;
  out.phrase=Math.min(23,Math.floor(beat/16));
  out.envelopes.fill(0);
  let melodyHue=0;
  if(amount>0&&!reduced)for(const cue of buckets[Math.floor(beat)]??[]) {
    const age=beat-cue.start;if(age<0||age>=cue.hold+cue.release)continue;
    const gain=cue.velocity*ease(age/cue.attack)*(1-ease((age-cue.hold)/cue.release));
    if(gain>out.envelopes[cue.voice]) {
      out.envelopes[cue.voice]=gain;
      if(cue.voice===0)melodyHue=cue.pitch;
    }
  }
  const [lead,pad,sweep,kick,snare,perc]=out.envelopes;
  const occultation=ease((beat-216)/12)*(1-ease((beat-252)/12));
  // No drum envelope reaches the rig or the sky. Rhythm is spatially masked in
  // the existing rocks and gas, with a deliberately small radiance budget.
  const slow=amount*tail;
  out.key=1+slow*(mix(0)-1);out.fill=1+slow*(mix(1)-1);out.ambient=1+slow*(mix(2)-1);
  out.warmth=1+slow*(mix(4)-1);out.violet=slow*mix(5);
  out.sky=slow*(.24+.28*pad)*(.4+.6*ease((beat-248)/28))*(1-.6*ease((beat-320)/40));
  out.face=out.motion*(.15*lead+.035*kick)*(1-.70*occultation);
  out.ring=out.motion*(.27*lead+.18*pad+.10*sweep);
  out.storm=out.motion*(.05*lead+.10*snare+.075*perc+.08*sweep)*(1-.90*occultation);
  out.travel=out.motion?(beat/16)%1:0;
  out.corona=1+slow*(.28*ease((beat-216)/20)*(1-ease((beat-252)/16))+.10*pad+.12*sweep*occultation);
  out.planet=1+slow*(.18*ease((beat-312)/32)+.10*lead);
  out.fiber=out.motion*(.045*snare+.04*perc+.14*lead);
  // Six existing gas structures answer in different orders. The emission floor
  // remains intact for Boost/Sightseeing arrivals ahead of the musical chapter.
  const bloom=ease((beat-248)/24)*(1-ease((beat-320)/36));
  const starts=[260,252,268,276,284,292];
  for(let layer=0;layer<6;layer++) {
    const reveal=ease((beat-starts[layer])/18),harmony=reduced?0:pad*(layer%2?.16:.09)+lead*(layer===1?.06:.13)+sweep*.10;
    out.nebula[layer]=1+slow*((mix(3)-1)*.48+bloom*reveal*(.28+layer*.018)+harmony);
    out.hues[layer]=slow*bloom*(.10+.10*reveal+(reduced?0:.045*melodyHue));
  }
  return out;
}
