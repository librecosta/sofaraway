import { Graphics } from '../../app/game/graphics/scene.client';
import { Simulation } from '../../app/game/core/simulation';
import { idleInput } from '../../app/game/core/input';
import { STEP } from '../../app/game/core/clock';
import { volumeById } from '../../app/game/core/volumes';
import { orbitSceneBeats } from '../../app/game/core/orbit-setpieces';
import type { QualityTier } from '../../app/game/contracts';

export async function inspectCosmicCourse(quality:QualityTier) {
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const graphics=new Graphics(canvas,quality,false,{fixedTime:null,autoplay:false,align:true,god:false,boost:false,
    mobileQuality:false,post:true,record:false,debug:true});
  const sim=new Simulation(volumeById('orbit'),{align:true,branchSide:'center'});sim.start('normal',0);
  graphics.resize(960,540,1);graphics.load(sim.volume,sim.path,'standard');
  const frames=[];
  try{
    for(const beat of orbitSceneBeats) {
      while(sim.phase==='playing'&&sim.trackDistance<sim.reference.station(beat,'standard'))sim.step(STEP,idleInput);
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      graphics.draw(sim,true);
      const pixels=new Uint8Array(960*540*4);graphics.gl.readPixels(0,0,960,540,graphics.gl.RGBA,graphics.gl.UNSIGNED_BYTE,pixels);
      let chromatic=0,bright=0;const hues=new Set<number>();
      for(let i=0;i<pixels.length;i+=16) {
        const r=pixels[i],g=pixels[i+1],b=pixels[i+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b);
        if(hi>50&&hi-lo>30){chromatic++;hues.add(Math.round((Math.atan2(Math.sqrt(3)*(g-b),2*r-g-b)+Math.PI)*8/Math.PI));}
        if(hi>30)bright++;
      }
      frames.push({beat,metrics:graphics.metrics(),bright,chromatic,hues:[...hues],png:canvas.toDataURL('image/png')});
    }
    return {frames,glError:graphics.gl.getError(),lives:sim.lives};
  }finally{graphics.dispose();canvas.remove();}
}
