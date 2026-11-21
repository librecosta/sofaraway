import * as THREE from 'three';
import type { QualityTier } from '../../app/game/contracts';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { STEP } from '../../app/game/core/clock';
import { idleInput } from '../../app/game/core/input';
import { Graphics } from '../../app/game/graphics/scene.client';
import { nebulaIntegration } from '../../app/game/graphics/orbit-cosmic-shaders';

export async function inspectOrbitSurfaces(quality:QualityTier) {
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,align:true,god:false,boost:false,
    mobileQuality:false,post:false,record:false,debug:true});
  const sim=new Simulation(volumeById('orbit'),{align:true,branchSide:'center'});sim.start('normal',0);
  graphics.resize(960,540,1);graphics.load(sim.volume,sim.path,'standard');
  const frames=[];
  try {
    for(const [family,beat]of [[0,8],[3,8],[1,42],[2,42],[4,42]]) {
      while(sim.trackDistance<sim.reference.station(beat,'standard'))sim.step(STEP,idleInput);
      graphics.draw(sim,true);
      const volume=Reflect.get(graphics,'volume'),pieces=Reflect.get(volume.orbit,'setpieces');
      const heroes=[...Reflect.get(pieces,'active').values()].flatMap((p:any)=>p.heroes);
      const hero=heroes.find(h=>h.body.shape===family&&!h.body.id.includes('plate'));
      const center=hero.mesh.position.clone(),frame=sim.path.sample(sim.trackDistance);
      graphics.camera!.position.copy(center).addScaledVector(frame.f,-hero.body.radius*1.7).addScaledVector(frame.r,-hero.body.radius*.10);
      graphics.camera!.lookAt(center);graphics.camera!.updateMatrixWorld();
      graphics.renderer.render(volume.scene,graphics.camera!);
      frames.push({family,id:hero.body.id,lod:hero.lod,scale:hero.body.scale,png:canvas.toDataURL(),metrics:graphics.metrics()});
      await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    return {frames,glError:graphics.gl.getError(),badPrograms:graphics.renderer.info.programs?.filter(p=>Reflect.get(p,'diagnostics')?.runnable===false).length??0};
  } finally{graphics.dispose();canvas.remove();}
}

export function inspectNebulaSegments() {
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,alpha:true});
  renderer.setSize(8,8);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=3;
  const geometry=new THREE.PlaneGeometry(2,2),materials:THREE.ShaderMaterial[]=[];
  const layers=(coefficients:number[][],background:number)=>{
    scene.clear();renderer.setClearColor(new THREE.Color(background,background,background),1);
    for(const [i,c]of coefficients.entries()) {
      const material=new THREE.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthTest:true,depthWrite:false,
        uniforms:{emission:{value:new THREE.Vector3(...c.slice(0,3))},gas:{value:c[3]},dust:{value:c[4]},weight:{value:c[5]}},
        vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`${nebulaIntegration}\nuniform vec3 emission;uniform float gas,dust,weight;void main(){gl_FragColor=nebulaSegment(emission,gas,dust,weight);}`});
      materials.push(material);const mesh=new THREE.Mesh(geometry,material);mesh.position.z=-i*.2;scene.add(mesh);
    }
    renderer.render(scene,camera);const rgba=new Uint8Array(4);renderer.getContext().readPixels(4,4,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,rgba);
    return [...rgba];
  };
  try {
    const cases=[{c:[[0,0,0,0,0,1]],bg:1},{c:[[0,0,0,0,.8,1]],bg:1},
      {c:[[.3,.15,.05,.8,.2,1]],bg:0},{c:[[.3,.15,.05,.8,.2,.5]],bg:1},
      {c:[[.3,.15,.05,.8,.2,1],[.05,.12,.2,.6,.1,.7]],bg:1},
      {c:[[1e-8,2e-8,3e-8,1e-7,0,1]],bg:0},{c:[[.4,.2,.1,1,1,0]],bg:1}];
    return {cases:cases.map(v=>({...v,rgba:layers(v.c,v.bg)})),glError:renderer.getContext().getError()};
  }finally{for(const m of materials)m.dispose();geometry.dispose();renderer.dispose();renderer.forceContextLoss();}
}

/** Isolate gas filtering from moving gates, rocks and the game's animated grain. */
export async function inspectNebulaFlight(quality:QualityTier,dpr:number,frozen:boolean,boost:boolean) {
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%';document.body.append(canvas);
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,align:true,god:false,boost,
    mobileQuality:false,post:false,record:false,debug:true});
  const sim=new Simulation(volumeById('orbit'),{align:true,branchSide:'center'});sim.start('normal',0);
  graphics.resize(960,540,dpr);graphics.load(sim.volume,sim.path,'standard');
  while(sim.trackDistance<sim.reference.station(274,'standard'))sim.step(STEP,{...idleInput,boosting:boost});
  if(frozen){sim.speed=boost?48:30;sim.boostLens=Number(boost);}
  const deltas:number[]=[],images:string[]=[],means:number[]=[];
  let previous:number[]|undefined;
  try {
    const gl=graphics.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);
    for(let frame=0;frame<120;frame++) {
      if(frozen){sim.time+=STEP;sim.beat+=STEP/sim.secondsPerBeat;}
      else sim.step(STEP,{...idleInput,boosting:boost});
      graphics.draw(sim,true);
      const volume=Reflect.get(graphics,'volume');
      volume.scene.traverse((object:THREE.Object3D)=>{
        if(object instanceof THREE.Mesh)object.visible=object.material instanceof THREE.ShaderMaterial
          &&object.material.fragmentShader.includes('vec4 nebulaSegment');
        if(object instanceof THREE.Points)object.visible=false;
      });
      graphics.camera!.position.copy(sim.path.sample(sim.trackDistance).p);
      graphics.renderer.render(volume.scene,graphics.camera!);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const grid:number[]=[];
      for(let y=Math.round(h*.1);y<h*.9;y+=Math.ceil(h/55))for(let x=Math.round(w*.03);x<w*.32;x+=Math.ceil(w/100)) {
        const i=(y*w+x)*4;grid.push((pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255);
      }
      means.push(grid.reduce((a,b)=>a+b,0)/grid.length);
      if(previous)deltas.push(grid.reduce((sum,value,i)=>sum+Math.abs(value-previous![i]),0)/grid.length);
      previous=grid;
      if(frame%40===0)images.push(canvas.toDataURL());
      await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    return {deltas,means,images,metrics:graphics.metrics(),glError:gl.getError()};
  } finally{graphics.dispose();canvas.remove();}
}
