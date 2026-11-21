import { orbitRandom } from './orbit-field';
import type { OrbitPoint } from './orbit-field';

export const ringLayers = ['main-belt','inner-ringlet','outer-ringlet','displaced-sheet','fine-debris'] as const;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const angular=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

/** Continuous torn-edge density. Ringlets have displaced fractures, not cloned holes. */
export function ringDensity(angle:number,layer:number) {
  let gap=1;
  for(const [center,width]of [[.46,.18],[2.45,.19],[4.65,.15]]) {
    const d=angular(angle,center+layer*.045);
    gap*=smooth(width*.32,width*1.85,d);
  }
  const wave=.73+.27*Math.cos(angle*7-layer*1.7+Math.sin(angle*3));
  return gap*wave;
}

export function ringFragments(seed:number,emit:(position:OrbitPoint,radius:number,structure:string)=>void) {
  const random=orbitRandom(seed,0x52494e47);
  const counts=[1600,390,420,270,360],radii=[290,218,374,428,325];
  for(let layer=0;layer<counts.length;layer++)for(let i=0;i<counts[layer];i++) {
    const angle=random()*Math.PI*2;
    if(random()>ringDensity(angle,layer))continue;
    const densityWave=Math.sin(angle*4+layer*.8);
    const width=layer===0?30+22*(densityWave+1):layer===4?68:7+4*(densityWave+1);
    const across=(random()+random()-1)*width;
    const radius=radii[layer]*(1+.065*Math.cos(angle-.5*layer))+across+12*Math.sin(angle*3+layer);
    const tear=Math.exp(-1*(angular(angle,2.45)/.33)**2);
    const x=Math.cos(angle)*radius+tear*layer*12;
    const y=217+Math.sin(angle)*(radius*.77)+layer*9+tear*28;
    const z=Math.sin(angle+.12*layer)*(110+layer*29)+(random()-.5)*(layer===0?42:12)+tear*layer*22;
    emit([x,y,z],layer===4?.55+random()*1.7:1.5+random()**2.7*(layer===0?17:10),ringLayers[layer]);
  }
  // Fracture fans leave the parent arc tangentially and spread through depth.
  for(const angle of [.55,2.56,4.78])for(let i=0;i<52;i++) {
    const t=random(),radius=290+(random()-.5)*35;
    emit([Math.cos(angle)*radius-Math.sin(angle)*t*130,
      217+Math.sin(angle)*radius*.77+Math.cos(angle)*t*65,
      Math.sin(angle)*110+t*125+(random()-.5)*38],2+((1-t)**2)*random()*22,'fracture-fan');
  }
}
