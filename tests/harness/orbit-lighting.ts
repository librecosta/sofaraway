import { Graphics } from '../../app/game/graphics/scene.client';
import { buildRunPath } from '../../app/game/graphics/path';
import { volumeById } from '../../app/game/core/volumes';
import type { QualityTier } from '../../app/game/contracts';
import type { OrbitWorld } from '../../app/game/graphics/orbit-world.client';
import type { Mesh, ShaderMaterial } from 'three';
import { ORBIT_WORLD_SEED } from '../../app/game/core/orbit-field';

/** Fixed player view, independently seekable score; all resources are production-owned. */
export async function inspectOrbitLighting(quality:QualityTier,worldBeat:number,beats:readonly number[],amount=1,reducedMotion=false){
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,god:false,align:false,boost:false,
    mobileQuality:false,post:true,debug:false,record:false});
  const path=buildRunPath(volumeById('orbit')),station=path.reference!.station(worldBeat,'standard');
  graphics.resize(960,540,1);graphics.loadOrbit(path,ORBIT_WORLD_SEED,'flight');
  const frames=[];let identity='',replaced=false;const resources=new Set<{addEventListener(type:'dispose',callback:()=>void):void}>();let freed=0;
  try{
    for(const beat of beats){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      graphics.drawOrbit({station,x:0,y:0,time:0,lighting:{beat,amount,reducedMotion}});
      const orbit:OrbitWorld=Reflect.get(graphics,'volume').orbit;
      const surfaces:unknown[]=[],optics:unknown[]=[],ids:string[]=[];
      orbit.group.traverse(object=>{
        const mesh=object as Mesh;if(!mesh.isMesh&&!Reflect.get(mesh,'isPoints'))return;
        ids.push(`${mesh.uuid}:${mesh.geometry.uuid}:${mesh.position.toArray()}:${mesh.scale.toArray()}`);
        resources.add(mesh.geometry);
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
          resources.add(material);
          const shader=material as ShaderMaterial;
          if(shader.uniforms?.choreoGain)optics.push({gain:shader.uniforms.choreoGain.value,alpha:shader.premultipliedAlpha,
            depthTest:shader.depthTest,depthWrite:shader.depthWrite,layer:shader.uniforms.layer.value});
          if(material.customProgramCacheKey().includes('starwake-surface-light'))surfaces.push(material.uuid);
        }
      });
      const id=JSON.stringify(ids);if(identity&&id!==identity)replaced=true;identity=id;
      frames.push({beat,station,fov:graphics.camera!.fov,metrics:graphics.metrics(),surfaces:surfaces.length,optics,png:canvas.toDataURL()});
    }
    for(const resource of resources)resource.addEventListener('dispose',()=>freed++);
    const glError=graphics.gl.getError();graphics.dispose();
    return {frames,replaced,glError,resources:resources.size,freed};
  }finally{canvas.remove();}
}
