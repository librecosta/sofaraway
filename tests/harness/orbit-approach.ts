import { Graphics } from '../../app/game/graphics/scene.client';
import { Simulation } from '../../app/game/core/simulation';
import { idleInput } from '../../app/game/core/input';
import { STEP } from '../../app/game/core/clock';
import { volumeById } from '../../app/game/core/volumes';
import type { QualityTier } from '../../app/game/contracts';
import type { CosmicBody } from '../../app/game/core/orbit-setpieces';
import type { Mesh,Material } from 'three';

/** Real player camera and production world; reflection stays in the test bundle. */
export async function inspectRockApproach(quality:QualityTier,boost:boolean,from=0,to=78,height=540) {
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const previous=document.createElement('canvas');previous.width=height*16/9;previous.height=height;
  const context=previous.getContext('2d')!;
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,align:true,god:false,boost,
    mobileQuality:false,post:true,record:false,debug:false});
  const sim=new Simulation(volumeById('orbit'),{align:true,branchSide:'center'});sim.start('normal',0);
  graphics.resize(height*16/9,height,1);graphics.load(sim.volume,sim.path,'standard');
  const history=new Map<string,string>(),materials=new Map<string,string>(),large=new Map<string,number>(),frames=[],switches=[],images:string[]=[];
  let materialChanges=0;
  let largeChanges=0;
  while(sim.trackDistance<sim.reference.station(from,'standard'))sim.step(STEP,{...idleInput,boosting:boost});
  try {
    for(let i=0;sim.phase==='playing'&&sim.trackDistance<sim.reference.station(to,'standard');i++) {
      sim.step(STEP,{...idleInput,boosting:boost});graphics.draw(sim,true);
      const world=Reflect.get(graphics,'volume').orbit, pieces=Reflect.get(world,'setpieces');
      const active:Map<string,{fade:{value:number};heroes:{mesh:Mesh;body:CosmicBody;lod:number}[]}>=Reflect.get(pieces,'active');
      for(const piece of active.values())for(const hero of piece.heroes) {
        const mesh=hero.mesh,key=hero.body.id,geometry=mesh.geometry;
        const sample={id:key,lod:hero.lod,geometry:geometry.uuid,vertices:geometry.getAttribute('position').count,
          material:(mesh.material as Material).uuid,
          pixels:height*graphics.camera!.projectionMatrix.elements[5]*hero.body.radius/graphics.camera!.position.distanceTo(mesh.position),
          station:sim.trackDistance,presence:piece.fade.value,programs:graphics.metrics().programs};
        if(history.has(key)&&history.get(key)!==geometry.uuid) switches.push({...sample,before:previous.toDataURL(),after:canvas.toDataURL()});
        history.set(key,geometry.uuid);if(i%12===0)frames.push(sample);
        if(materials.has(key)&&materials.get(key)!==sample.material)materialChanges++;
        materials.set(key,sample.material);
      }
      for(const [id,piece]of active) {
        const description=pieces.descriptions.find((p:{id:string})=>p.id===id);
        const levels:Int8Array=Reflect.get(piece,'levels');
        for(const [j,rock]of description.rocks.entries())if(rock.radius>=6 && levels[j]>=0) {
          if(large.has(rock.id)&&large.get(rock.id)!==levels[j])largeChanges++;
          large.set(rock.id,levels[j]);
        }
      }
      context.drawImage(canvas,0,0);
      if(i%240===0)images.push(canvas.toDataURL());
      if(i%2===0)await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    return {frames,switches,materialChanges,images,largeChanges,largeRocks:large.size,glError:graphics.gl.getError(),resources:graphics.metrics()};
  } finally {graphics.dispose();canvas.remove();}
}
