import { describe, expect, it } from 'vitest';
import { newOrbitLighting, orbitLightingAt, orbitLightBucketLimit, orbitLightCueIds, orbitLightVoices } from '../../app/game/core/orbit-lighting';
import { starwakeEvents, starwakeTrack, beatSeconds } from '../../app/game/core/orbit-score';

const plain = (beat:number,amount=1,reducedMotion=false)=>JSON.parse(JSON.stringify(orbitLightingAt(beat,{amount,reducedMotion})));
describe('STARWAKE cosmic light score',()=>{
  it('indexes the actual frozen score, including repaired lead identities, in bounded overlap buckets',()=>{
    expect(orbitLightCueIds).toEqual(starwakeEvents.filter(e=>orbitLightVoices.includes(e.voice as typeof orbitLightVoices[number])).map(e=>e.id));
    expect(orbitLightBucketLimit).toBeLessThan(60);
    expect(new Set(orbitLightCueIds).size).toBe(orbitLightCueIds.length);
  });
  it('reconstructs identical envelopes after arbitrary seeks and frame-rate histories',()=>{
    const target=plain(280.375),out=newOrbitLighting();
    for(const beat of [384,18,127.75,0,240,280.375])orbitLightingAt(beat,{amount:1},out);
    expect(JSON.parse(JSON.stringify(out))).toEqual(target);
    for(const hz of [30,60,144]){
      for(let frame=0;frame<hz;frame++)orbitLightingAt(280+frame/hz,{amount:1},out);
      orbitLightingAt(280.375,{amount:1},out);
      expect(JSON.parse(JSON.stringify(out))).toEqual(target);
    }
  });
  it('holds lead and pad envelopes through real sustained notes, then releases smoothly',()=>{
    for(const [voice,index] of [['lead',0],['pad',1]] as const){
      const event=starwakeEvents.find(e=>e.voice===voice&&'length' in e&&e.length>(voice==='lead'?1:2))!;
      const length='length' in event?event.length/beatSeconds:0;
      expect(orbitLightingAt(event.beat+Math.max(1.5,length*.75)).envelopes[index]).toBeGreaterThan(.1);
    }
  });
  it('crossfades section rigs without beat pulses, preserving an eclipse visibility floor',()=>{
    for(const section of starwakeTrack.sections.slice(1)){
      const a=orbitLightingAt(section.startBeat-1e-5),b=orbitLightingAt(section.startBeat+1e-5);
      for(const key of ['key','fill','ambient'] as const)expect(Math.abs(a[key]-b[key])).toBeLessThan(1e-5);
    }
    const states=Array.from({length:100},(_,i)=>orbitLightingAt(180+i/100));
    for(const key of ['key','fill','ambient'] as const)expect(new Set(states.map(s=>s[key])).size).toBe(1);
    expect(orbitLightingAt(240).ambient).toBeGreaterThan(.85);
    expect(orbitLightingAt(240).key).toBeLessThan(orbitLightingAt(192).key);
    const bloom=orbitLightingAt(300);
    expect(new Set(bloom.nebula).size).toBeGreaterThan(3);
    expect(Math.max(...bloom.nebula)).toBeGreaterThan(1.45);
  });
  it('keeps dynamic-off neutral and reduced motion slow, and settles for audio tail and Results',()=>{
    for(const beat of [0,64,144,192,240,280,360,384,392]){
      const off=orbitLightingAt(beat,{amount:0});
      expect([off.key,off.fill,off.ambient,off.corona,off.planet,...off.nebula]).toEqual(Array(11).fill(1));
      expect([off.face,off.ring,off.storm,off.sky,off.travel,...off.hues]).toEqual(Array(11).fill(0));
      const reduced=orbitLightingAt(beat,{amount:1,reducedMotion:true});
      expect([reduced.face,reduced.ring,reduced.storm,reduced.fiber,reduced.travel,...reduced.envelopes]).toEqual(Array(11).fill(0));
    }
    expect(orbitLightingAt(280,{reducedMotion:true}).nebula[1]).toBeGreaterThan(1.2);
    const end=plain(384),tail=plain(392);
    for(const key of ['key','fill','ambient','sky','corona','planet','face','ring','storm','nebula','hues'])expect(tail[key]).toEqual(end[key]);
  });
});
