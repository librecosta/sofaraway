import {expect,test} from '@playwright/test';
import type {} from '../harness/main';
import { orbitSceneBeats } from '../../app/game/core/orbit-setpieces';
import { referenceFor } from '../../app/game/core/reference-track';
import { volumeById } from '../../app/game/core/volumes';

test.use({video:{mode:'on',size:{width:960,height:540}}});
test('STARWAKE lights existing landmarks at independent music positions without geometry changes',async({page},run)=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://127.0.0.1:8090/');
  for(const quality of ['low','auto','high'] as const)for(const [index,world]of orbitSceneBeats.entries()){
    const beat=[18,64,140,192,240,292,348][index];
    const sample=await page.evaluate(({quality,world,beat})=>window.b0Harness.inspectOrbitLighting(quality,world,[beat,beat+.25,beat+2,beat]),{quality,world,beat});
    expect(sample).toMatchObject({glError:0,replaced:false});
    expect(sample.freed).toBe(sample.resources);
    const [first,,,last]=sample.frames;
    expect(last.png).toBe(first.png);
    expect(first.fov).toBe(76);
    expect(first.metrics.orbit!.lighting.amount).toBe(1);
    expect(first.metrics.orbit!.setpieces.active.length).toBeGreaterThan(0);
    if(index===5){
      expect(first.optics).toHaveLength(6);
      expect(sample.frames.every(frame => frame.fields === 1)).toBe(true);
      expect(first.optics).toEqual(expect.arrayContaining([expect.objectContaining({alpha:true,depthTest:true,depthWrite:false})]));
      expect(new Set(first.metrics.orbit!.lighting.nebula).size).toBeGreaterThan(3);
    }
    if(quality==='high')for(const [i,frame]of sample.frames.slice(0,3).entries())await run.attach(`${index}-${i}`,{body:Buffer.from(frame.png.split(',')[1],'base64'),contentType:'image/png'});
  }
  expect(errors).toEqual([]);
});

test('disabled lights stay neutral; reduced motion keeps slow chapters with no transient response',async({page})=>{
  await page.goto('http://127.0.0.1:8090/');
  const off=await page.evaluate(()=>window.b0Harness.inspectOrbitLighting('auto',280,[64,140,192,240,292],0));
  expect(new Set(off.frames.map(f=>f.png)).size).toBe(1);
  const reduced=await page.evaluate(()=>window.b0Harness.inspectOrbitLighting('auto',280,[240,292],1,true));
  expect(reduced.frames[0].png).not.toBe(reduced.frames[1].png);
  for(const frame of reduced.frames){expect(frame.metrics.orbit!.lighting.motion).toBe(0);expect(frame.metrics.orbit!.lighting.local).toEqual([0,0,0]);}
});

test('Debug music plays, pauses, seeks and restores without moving its fixed world station',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/debug/lighting/?vol=orbit&q=low');
  const section=page.locator('#orbit');await section.getByRole('button',{name:'Open live scene'}).click();
  const metrics=()=>section.locator('[data-orbit-metrics]').getAttribute('data-orbit-metrics').then(s=>JSON.parse(s!));
  await expect(section.locator('[data-orbit-metrics]')).toBeVisible();
  await section.getByRole('button',{name:'AURORA',exact:true}).click();
  await section.getByRole('button',{name:'Light: AURORA',exact:true}).click();
  await expect.poll(async()=>(await metrics()).orbit.lighting.beat).toBe(256);
  const station=(await metrics()).orbit.setpieces.station;
  await section.getByRole('button',{name:'Play STARWAKE',exact:true}).click();
  await expect.poll(async()=>(await metrics()).orbit.lighting.beat).toBeGreaterThan(258);
  await section.getByRole('button',{name:'Pause STARWAKE',exact:true}).click();
  const held=(await metrics()).orbit.lighting.beat;
  await page.waitForTimeout(300);
  expect((await metrics()).orbit.lighting.beat).toBe(held);
  expect((await metrics()).orbit.setpieces.station).toBe(station);
  await section.getByLabel('Reduced motion',{exact:true}).check();
  await expect.poll(async()=>(await metrics()).orbit.lighting.motion).toBe(0);
  await section.getByLabel('Dynamic lighting',{exact:true}).uncheck();
  await expect.poll(async()=>(await metrics()).orbit.lighting.amount).toBe(0);
  const canvas=section.locator('canvas');
  await canvas.evaluate((el:HTMLCanvasElement)=>{
    el.addEventListener('webglcontextrestored',()=>{el.dataset.restored='true';},{once:true});
    const ext=el.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;ext.loseContext();setTimeout(()=>ext.restoreContext(),300);
  });
  await expect(canvas).toHaveAttribute('data-restored','true');
  await expect(section.getByRole('button',{name:'Play STARWAKE',exact:true})).toBeEnabled();
  expect((await metrics()).orbit.setpieces.station).toBe(station);
  await section.getByRole('link',{name:'Open in game'}).click();
  expect(errors).toEqual([]);
});

test('@perf cosmic lighting reuses scene resources at all qualities in the translucent climax',async({page},run)=>{
  test.setTimeout(90000);
  await page.goto('http://127.0.0.1:8090/?stability');await page.waitForFunction(()=>!!window.stability);
  const station=referenceFor(volumeById('orbit')).station(280,'standard'),samples=[];
  for(const quality of ['low','auto','high'] as const){
    const pair=[];
    for(const dynamic of [false,true]){
      const sample=await page.evaluate(({quality,dynamic,station})=>window.stability.fixedGlass(280,quality,false,'standard','center',120,true,
        {station,volumeId:'orbit',dynamic,inspection:true}),{quality,dynamic,station});
      expect(sample.glError).toBe(0);pair.push(sample);samples.push({quality,dynamic,...sample});
    }
    for(const key of ['calls','triangles','programs','geometries','textures'] as const)expect(pair[1].metrics[key]).toBe(pair[0].metrics[key]);
  }
  await run.attach('Uniform-only cosmic light performance',{body:JSON.stringify(samples,null,2),contentType:'application/json'});
});
