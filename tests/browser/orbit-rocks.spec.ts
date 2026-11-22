import { expect, test } from '@playwright/test';
import type {} from '../harness/main';
import type {} from '../harness/stability';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';

test('hero surfaces and large debris stay identical throughout real player-camera approaches',async({page},run)=>{
  test.setTimeout(240_000);
  await page.goto('http://127.0.0.1:8090/');
  const summaries=[];
  for(const [quality,boost,from,to,height,difficulty]of [
    ['high',false,0,78,1080,'normal'],['low',true,0,78,540,'normal'],['auto',true,95,143,540,'normal'],
    ['auto',true,0,143,540,'impossible'],
  ] as const) {
    const sample=await page.evaluate(({quality,boost,from,to,height,difficulty})=>window.b0Harness.inspectRockApproach(quality,boost,from,to,height,difficulty),
      {quality,boost,from,to,height,difficulty});
    expect(sample.glError).toBe(0);
    expect(sample.switches).toEqual([]);
    expect(sample.materialChanges).toBe(0);
    expect(sample.largeChanges).toBe(0);
    expect(sample.largeRocks).toBeGreaterThan(20);
    const ids=[...new Set(sample.frames.map(f=>f.id))];
    expect(ids.length).toBeGreaterThan(4);
    for(const id of ids) {
      const frames=sample.frames.filter(f=>f.id===id);
      expect(new Set(frames.map(f=>f.geometry)).size).toBe(1);
      expect(new Set(frames.map(f=>f.material)).size).toBe(1);
      expect(new Set(frames.map(f=>f.lod))).toEqual(new Set([quality==='low'?1:0]));
    }
    summaries.push({quality,boost,from,to,height,difficulty,heroes:ids,largeRocks:sample.largeRocks,
      switches:sample.switches.length,resources:sample.resources});
    for(const [i,png]of sample.images.entries())await run.attach(`approach-${quality}-${difficulty}-${i}`,{
      body:Buffer.from(png.split(',')[1],'base64'),contentType:'image/png'});
  }
  await run.attach('Continuous geometry identity and GPU resources',{body:JSON.stringify(summaries),contentType:'application/json'});
});

test('hero materials retain bounded GPU resources in near-world flight windows @perf',async({page},run)=>{
  test.setTimeout(120000);
  await page.goto('http://127.0.0.1:8090/?stability');
  await expect.poll(()=>page.evaluate(()=>!!window.stability)).toBe(true);
  const reference=new Simulation(volumeById('orbit')).reference,samples=[];
  for(const quality of ['low','auto','high'] as const)for(const beat of [8,42,140]) {
    const sample=await page.evaluate(({quality,beat,station})=>window.stability.fixedGlass(beat,quality,beat===140,
      'standard','center',240,false,{volumeId:'orbit',station,fly:false}),{quality,beat,station:reference.station(beat,'standard')});
    expect(sample.glError).toBe(0);expect(sample.phase).toBe('playing');
    expect(sample.metrics.orbit!.setpieces.active.flatMap(p=>p.heroGeometry).length).toBeGreaterThan(0);
    expect(sample.metrics.programs).toBeLessThan(20);expect(sample.metrics.textures).toBeLessThan(20);
    expect(sample.trace.cpu.frame.n).toBe(240);
    samples.push({quality,beat,renderer:sample.renderer,trace:sample.trace,metrics:sample.metrics});
  }
  await run.attach('Hero scenic frame and GPU resources',{body:JSON.stringify(samples),contentType:'application/json'});
});
