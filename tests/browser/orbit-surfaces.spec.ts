import {expect,test} from '@playwright/test';
import type {} from '../harness/main';

test('all geological families compile at every tier in the real world with nonuniform scale',async({page},run)=>{
  const errors:string[]=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    const gl=WebGL2RenderingContext.prototype,bound=new WeakMap<WebGL2RenderingContext,WebGLTexture|null>();
    const textures=new Set<WebGLTexture>(),counts={created:0,released:0};Reflect.set(window,'stoneTextures',counts);
    const {bindTexture,texImage3D,texStorage3D,deleteTexture}=gl;
    gl.bindTexture=function(target,texture){if(target===this.TEXTURE_3D)bound.set(this,texture);bindTexture.call(this,target,texture);};
    for(const [key,original]of [['texImage3D',texImage3D],['texStorage3D',texStorage3D]] as const)
      gl[key]=function(...args:unknown[]){
        const texture=bound.get(this);
        if(args[0]===this.TEXTURE_3D&&args[3]===64&&texture&&!textures.has(texture)){textures.add(texture);counts.created++;}
        Reflect.apply(original,this,args);
      };
    gl.deleteTexture=function(texture){if(texture&&textures.delete(texture))counts.released++;deleteTexture.call(this,texture);};
  });
  await page.goto('http://127.0.0.1:8090/');
  for(const quality of ['low','auto','high'] as const) {
    const result=await page.evaluate(q=>window.b0Harness.inspectOrbitSurfaces(q),quality);
    expect(result.glError).toBe(0);expect(result.badPrograms).toBe(0);
    expect(result.frames.map(f=>f.family)).toEqual([0,3,1,2,4]);
    for(const frame of result.frames) {
      expect(frame.lod).toBe(quality==='low'?1:0);
      expect(Math.max(...frame.scale)/Math.min(...frame.scale)).toBeGreaterThan(1.1);
      if(quality==='high')await run.attach(`geology-${frame.family}`,{body:Buffer.from(frame.png.split(',')[1],'base64'),contentType:'image/png'});
    }
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>Reflect.get(window,'stoneTextures'))).toEqual({created:3,released:3});
});

test('production gas optics integrate emission, dust, near-zero density and sorted premultiplied layers',async({page})=>{
  await page.goto('http://127.0.0.1:8090/');
  const result=await page.evaluate(()=>window.b0Harness.inspectNebulaSegments());
  expect(result.glError).toBe(0);
  for(const {c,bg,rgba}of result.cases) {
    let color=[bg,bg,bg];
    for(const layer of [...c].reverse()) {
      const [r,g,b,gas,dust,weight]=layer,tau=(gas+2.15*dust)*weight;
      const transmission=Math.exp(-tau),integral=tau===0?1:-Math.expm1(-tau)/tau;
      color=[r,g,b].map((emission,i)=>emission*weight*integral+color[i]*transmission);
    }
    for(let i=0;i<3;i++)expect(Math.abs(rgba[i]-Math.round(color[i]*255))).toBeLessThanOrEqual(2);
    expect(rgba[3]).toBe(255);
  }
});

test('AURORA retains resolved gas and dust at both DPRs without time-driven texture crawl',async({page},run)=>{
  test.setTimeout(90000);
  await page.goto('http://127.0.0.1:8090/');
  for(const quality of ['low','auto','high'] as const)for(const dpr of [1,2]) {
    for(const frozen of [true,false]) {
      const result=await page.evaluate(({quality,dpr,frozen})=>window.b0Harness.inspectNebulaFlight(quality,dpr,frozen,!frozen),{quality,dpr,frozen});
      expect(result.glError).toBe(0);
      expect(Math.max(...result.means)).toBeGreaterThan(.02);
      expect(Math.max(...result.deltas)).toBeLessThan(frozen?.00001:.025);
      if(!frozen&&quality==='high')for(const [i,png]of result.images.entries())await run.attach(`nebula-dpr${dpr}-${i}`,
        {body:Buffer.from(png.split(',')[1],'base64'),contentType:'image/png'});
    }
  }
});
