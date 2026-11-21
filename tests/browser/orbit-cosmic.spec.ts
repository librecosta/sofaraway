import {expect,test} from '@playwright/test';
import type {} from '../harness/main';
import { referenceFor } from '../../app/game/core/reference-track';
import { volumeById } from '../../app/game/core/volumes';

test.use({video:{mode:'on',size:{width:960,height:540}}});

test('seven production cosmic scenes retain their identity at every quality with readable real gates',async({page},run)=>{
  test.setTimeout(90000);
  await page.goto('http://127.0.0.1:8090/');
  const ids=['monolith','fractures','ring','spiral','eclipse','nebula','planet'];
  let landmarks:unknown;
  for(const quality of ['low','auto','high'] as const) {
    const sample=await page.evaluate(q=>window.b0Harness.inspectCosmicCourse(q),quality);
    expect(sample.glError).toBe(0);expect(sample.lives).toBe(2);
    for(const [i,frame]of sample.frames.entries()) {
      const pieces=frame.metrics.orbit!.setpieces;
      expect(pieces.active.some(p=>p.id===ids[i]&&p.presence>.85)).toBe(true);
      if(i===0)expect(pieces.active.flatMap(p=>p.heroes)).toContain('Impact Scar');
      if(i===1)expect(pieces.active.flatMap(p=>p.heroes)).toEqual(expect.arrayContaining(['Twin-Lobe Mass','Stratified Cliff','Elongated Shard']));
      if(i===2)expect(pieces.landmarks.find(p=>p.id==='ring')!.structures).toHaveLength(7);
      if(i===5)expect(pieces.landmarks.find(p=>p.id==='nebula')!.nebula).toEqual(['arc','cliff','pillars','tendrils','filaments','nursery']);
      expect(frame.bright).toBeGreaterThan(200);
      expect(frame.metrics.chunks).toBe(0);
      if(landmarks)expect(pieces.landmarks).toEqual(landmarks);else landmarks=pieces.landmarks;
      if(i===5){expect(frame.chromatic).toBeGreaterThan(1500);expect(frame.hues.length).toBeGreaterThanOrEqual(6);}
      if(quality==='high')await run.attach(ids[i],{body:Buffer.from(frame.png.split(',')[1],'base64'),contentType:'image/png'});
    }
  }
});

test('cosmic preview seeks, flies across scene boundaries and restores every resource owner',async({page})=>{
  await page.goto('/debug/?q=low#orbit');
  const section=page.locator('#orbit');await section.getByRole('button',{name:'Open flight preview'}).click();
  const metric=()=>section.locator('[data-orbit-metrics]').getAttribute('data-orbit-metrics').then(s=>JSON.parse(s!));
  await expect(section.locator('[data-orbit-metrics]')).toBeVisible();
  const names=['OUTER BELT','DRIFT','RINGBREAK','MAELSTROM','ECLIPSE','AURORA','APHELION'];
  const counts=[];
  for(let repeat=0;repeat<3;repeat++){
    for(const name of names){
      await section.getByRole('button',{name,exact:true}).click();
      const destination=Number(await section.getByRole('slider',{name:'World station'}).inputValue());
      await expect.poll(async()=>Math.abs((await metric()).orbit.setpieces.station-destination)).toBeLessThan(1);
      expect((await metric()).orbit.setpieces.active.length).toBeGreaterThan(0);
    }
    counts.push((await metric()).geometries);
  }
  expect(counts[2]).toBe(counts[1]);
  for(const label of ['Ring: far','Ring: layers','Ring: fracture']) {
    await section.getByRole('button',{name:label,exact:true}).click();
    await expect.poll(async()=>(await metric()).orbit.setpieces.active.some((p:{id:string})=>p.id==='ring')).toBe(true);
  }
  const slider=section.getByRole('slider',{name:'World station'}),reference=referenceFor(volumeById('orbit'));
  for(const beat of [96,160,224,256,320]) {
    const boundary=reference.station(beat,'standard');
    await slider.evaluate((el:HTMLInputElement,value)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,String(value));
      el.dispatchEvent(new Event('input',{bubbles:true}));
    },Math.round(boundary-60));
    await expect.poll(async()=>Math.abs((await metric()).orbit.setpieces.station-(boundary-60))).toBeLessThan(1);
    await section.getByRole('button',{name:'Fly',exact:true}).click();
    await expect.poll(async()=>(await metric()).orbit.setpieces.station,{timeout:6000,intervals:[200]}).toBeGreaterThan(boundary+60);
    await section.getByRole('button',{name:'Pause flight'}).click();
  }
  const canvas=section.locator('canvas');
  await canvas.evaluate((el:HTMLCanvasElement)=>{
    el.addEventListener('webglcontextrestored',()=>{el.dataset.restored='true';},{once:true});
    const ext=el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;ext.loseContext();setTimeout(()=>ext.restoreContext(),300);
  });
  await expect(canvas).toHaveAttribute('data-restored','true');
  const start=await section.getByRole('slider',{name:'World station'}).inputValue();
  await section.getByRole('button',{name:'Fly',exact:true}).click();
  await expect.poll(()=>section.getByRole('slider',{name:'World station'}).inputValue()).not.toBe(start);
  await section.getByRole('button',{name:'Pause flight'}).click();
  expect((await metric()).orbit.setpieces.active.some((p:{id:string})=>p.id==='planet')).toBe(true);
  expect(await canvas.evaluate((el:HTMLCanvasElement)=>el.getContext('webgl2')!.getError())).toBe(0);
});
