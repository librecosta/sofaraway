import { expect, test } from '@playwright/test';
import type {} from '../harness/main';

test('hero surfaces and large debris stay identical throughout real player-camera approaches',async({page},run)=>{
  test.setTimeout(240_000);
  await page.goto('http://127.0.0.1:8090/');
  const summaries=[];
  for(const [quality,boost,from,to,height]of [
    ['high',false,0,78,1080],['low',true,0,78,540],['auto',true,95,143,540],
  ] as const) {
    const sample=await page.evaluate(({quality,boost,from,to,height})=>window.b0Harness.inspectRockApproach(quality,boost,from,to,height),
      {quality,boost,from,to,height});
    expect(sample.glError).toBe(0);
    expect(sample.switches).toEqual([]);
    expect(sample.largeChanges).toBe(0);
    expect(sample.largeRocks).toBeGreaterThan(20);
    const ids=[...new Set(sample.frames.map(f=>f.id))];
    expect(ids.length).toBeGreaterThan(4);
    for(const id of ids) {
      const frames=sample.frames.filter(f=>f.id===id);
      expect(new Set(frames.map(f=>f.geometry)).size).toBe(1);
      expect(new Set(frames.map(f=>f.lod))).toEqual(new Set([quality==='low'?1:0]));
    }
    summaries.push({quality,boost,from,to,height,heroes:ids,largeRocks:sample.largeRocks,
      switches:sample.switches.length,resources:sample.resources});
  }
  await run.attach('Continuous geometry identity and GPU resources',{body:JSON.stringify(summaries),contentType:'application/json'});
});
