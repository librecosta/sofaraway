import { Graphics } from '../../app/game/graphics/scene.client';
import { Simulation } from '../../app/game/core/simulation';
import { idleInput } from '../../app/game/core/input';
import { STEP } from '../../app/game/core/clock';
import { volumeById } from '../../app/game/core/volumes';
import type { QualityTier,Difficulty } from '../../app/game/contracts';
import type { OrbitSetpiece } from '../../app/game/core/orbit-setpieces';
import type { InstancedMesh } from 'three';

/** Real player camera and production world; reflection stays in the test bundle. */
export async function inspectRockApproach(quality:QualityTier,boost:boolean,from=0,to=78,height=540,difficulty:Difficulty='normal') {
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const previous=document.createElement('canvas');previous.width=height*16/9;previous.height=height;
  const context=previous.getContext('2d')!;
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,align:true,god:false,boost,
    mobileQuality:false,post:true,record:false,debug:false});
  const sim=new Simulation(volumeById('orbit'),{align:true,branchSide:'center'});sim.start(difficulty,0);
  graphics.resize(height*16/9,height,1);graphics.load(sim.volume,sim.path,'standard');
  const history=new Map<string,string>(),materials=new Map<string,string>(),large=new Map<string,number>(),frames=[],switches=[],images:string[]=[];
  let materialChanges=0;
  let largeChanges=0;
  while(sim.trackDistance<sim.reference.station(from,'standard'))sim.step(STEP,{...idleInput,boosting:boost});
  try {
    for(let i=0;sim.phase==='playing'&&sim.trackDistance<sim.reference.station(to,'standard');i++) {
      sim.step(STEP,{...idleInput,boosting:boost});graphics.draw(sim,true);
      const world=Reflect.get(graphics,'volume').orbit, pieces=Reflect.get(world,'setpieces');
      const active: Map<string, {fade: {value:number}; batches: Map<number, InstancedMesh>; levels: Int8Array}>=Reflect.get(pieces,'active');
      const descriptions: readonly OrbitSetpiece[] = pieces.descriptions;
      for (const [id, piece] of active) {
        const description = descriptions.find(p => p.id === id)!;
        for (const [j, rock] of description.rocks.entries()) {
          const lod = piece.levels[j];
          if (rock.radius < 6 || lod < 0) continue;
          if (large.has(rock.id) && large.get(rock.id) !== lod) largeChanges++;
          large.set(rock.id, lod);
          if (!rock.structure.endsWith('-boulder')) continue;
          const batch = piece.batches.get(rock.shape * 3 + lod)!;
          const geometry = batch.geometry.uuid, material = (Array.isArray(batch.material) ? batch.material[0] : batch.material).uuid;
          const sample = {id:rock.id,lod,geometry,material,station:sim.trackDistance,presence:piece.fade.value};
          if (history.has(rock.id) && history.get(rock.id) !== geometry) {
            switches.push({...sample,before:previous.toDataURL(),after:canvas.toDataURL()});
          }
          history.set(rock.id, geometry);
          if (materials.has(rock.id) && materials.get(rock.id) !== material) materialChanges++;
          materials.set(rock.id, material);
          if (i%12===0) frames.push(sample);
        }
      }
      context.drawImage(canvas,0,0);
      if(i%240===0)images.push(canvas.toDataURL());
      if(i%2===0)await new Promise<void>(r=>requestAnimationFrame(()=>r()));
    }
    return {frames,switches,materialChanges,images,largeChanges,largeRocks:large.size,glError:graphics.gl.getError(),resources:graphics.metrics()};
  } finally {graphics.dispose();canvas.remove();}
}
