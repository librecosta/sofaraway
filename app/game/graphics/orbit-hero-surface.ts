import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { stoneNoise } from './orbit-rock-surface';

function cellRandom(x:number,y:number,z:number,channel:number) {
  let h=Math.imul((x%4+4)%4,374761393)^Math.imul((y%4+4)%4,668265263)^Math.imul((z%4+4)%4,1274126177)^Math.imul(channel+17,1597334677);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
}

/** A prefiltered, periodic 3D rock field: joint distance, grains, weathering and pits.
 * The joints are irregular cellular boundaries, not sine contours or UV stripes. */
export function heroRockVolume(size=64) {
  const data=new Uint8Array(size**3*4);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const px=(x+.5)/size*4,py=(y+.5)/size*4,pz=(z+.5)/size*4;
    const ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz);
    let first=Infinity,second=Infinity;
    for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const cx=ix+dx,cy=iy+dy,cz=iz+dz;
      const distance=Math.hypot(px-cx-.18-.64*cellRandom(cx,cy,cz,0),
        py-cy-.18-.64*cellRandom(cx,cy,cz,1),pz-cz-.18-.64*cellRandom(cx,cy,cz,2));
      if(distance<first){second=first;first=distance;}else if(distance<second)second=distance;
    }
    const i=((z*size+y)*size+x)*4;
    data[i]=Math.round(Math.min(1,(second-first)*2)*255);
    data[i+1]=Math.round(stoneNoise(px*2,py*2,pz*2,8,3813)*255);
    data[i+2]=Math.round(stoneNoise(px,py,pz,4,8917)*255);
    data[i+3]=Math.round(Math.min(1,first)*255);
  }
  return data;
}

const vertexHeader=/* glsl */`
attribute vec4 heroFeatures;
attribute vec3 heroCoord;
attribute float rockFamily;
varying vec4 vHeroFeatures;
varying vec3 vHeroCoord,vHeroMeters;
varying float vHeroFamily;
`;
const vertexBody=/* glsl */`
// Local coordinates stay bounded and move with the rock. Physical-space grain
// compensates nonuniform scaling without world-position precision or UV seams.
vec3 heroScale=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
vHeroMeters=position*heroScale;
vHeroCoord=heroCoord;vHeroFeatures=heroFeatures;vHeroFamily=rockFamily;
`;
const fragmentHeader=/* glsl */`
uniform highp sampler3D heroField;
uniform float heroDetail;
varying vec4 vHeroFeatures;
varying vec3 vHeroCoord,vHeroMeters;
varying float vHeroFamily;
`;
const fragmentBody=/* glsl */`
vec3 jointCoord=vHeroCoord*.66+vec3(vHeroFamily*.173,.23,.47);
vec4 rock=texture(heroField,jointCoord);
vec3 grainCoord=vHeroMeters*.034+vec3(.31,.61,.17);
float footprint=max(length(dFdx(vHeroMeters)),length(dFdy(vHeroMeters)));
float grainWeight=(1.0-smoothstep(.5,2.2,footprint))*(heroDetail>.5?1.0:.45);
vec4 grain=mix(vec4(.5),texture(heroField,grainCoord),grainWeight);
vec3 microCoord=vHeroMeters*.13+vec3(.73,.11,.39);
float microWeight=(1.0-smoothstep(.10,.5,footprint))*(heroDetail>1.5?1.0:.4);
float micro=mix(.5,texture(heroField,microCoord).g,microWeight);
float fresh=vHeroFeatures.x,fault=vHeroFeatures.y,peel=vHeroFeatures.z,weather=vHeroFeatures.w;
float jointWidth=max(fwidth(rock.r),.012);
float joint=1.0-smoothstep(.025-jointWidth,.085+jointWidth,rock.r);
joint*=1.0-smoothstep(.10,.29,max(length(dFdx(jointCoord)),length(dFdy(jointCoord))));
// Secondary cracks occupy weathered and peeling patches; fresh shear planes
// remain broad and clean. No repeating horizontal or curved band function.
float fractureRegion=clamp(weather*.75+peel*.65,0.0,1.0)*(1.0-fresh*.7);
if(vHeroFamily>.5&&vHeroFamily<1.5)fractureRegion*=exp(-vHeroCoord.y*vHeroCoord.y*7.0);
float cracks=joint*fractureRegion;
float pore=smoothstep(.63,.83,grain.a)*smoothstep(.48,.65,grain.b)*grainWeight;
float height=(rock.b-.5)*.65+(grain.g-.5)*1.10+(grain.a-.5)*.32+(micro-.5)*.11
  -cracks*.40-fault*.38-peel*.10-pore*.07;
// Screen derivatives filter the baked volume and bound bump slopes at grazing
// angles. Quality only changes micro amplitude, never geometry or material ID.
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
vec3 r1=cross(dy,normal),r2=cross(normal,dx);
float det=dot(dx,r1);
vec3 slope=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
normal=normalize(normal-slope*(.72/max(abs(det),max(1e-7,length(slope)*2.4))));
float cavity=clamp(cracks*.30+fault*.35+peel*.10+pore*.05,0.0,.42);
float mineral=smoothstep(.67,.81,rock.b)*smoothstep(.56,.73,grain.g)*(1.0-weather);
diffuseColor.rgb*=mix(vec3(.90,.88,.85),vec3(1.05,1.04,1.01),fresh)*(.80+rock.b*.40)
  *(.90+grain.b*.20)*(1.0-cavity);
roughnessFactor=clamp(.94+weather*.045-fresh*.19-peel*.055+(.5-grain.g)*.07,.72,.99);
metalnessFactor=.015+mineral*.045;
`;

let bakedHero:Uint8Array|undefined;
/** Hero-only surface ownership; ordinary debris and celestial shaders stay unchanged. */
export class OrbitHeroSurface {
  readonly texture=new THREE.Data3DTexture(bakedHero??=heroRockVolume(),64,64,64);
  private readonly detail={value:1};
  constructor() {
    this.texture.name='ORBIT hero fracture field';
    this.texture.format=THREE.RGBAFormat;this.texture.type=THREE.UnsignedByteType;
    this.texture.wrapS=this.texture.wrapT=this.texture.wrapR=THREE.RepeatWrapping;
    this.texture.magFilter=THREE.LinearFilter;this.texture.minFilter=THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps=true;this.texture.needsUpdate=true;
  }
  update(quality:QualityTier){this.detail.value=quality==='low'?0:quality==='auto'?1:2;}
  apply(material:THREE.MeshStandardMaterial) {
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      shader.uniforms.heroField={value:this.texture};shader.uniforms.heroDetail=this.detail;
      shader.vertexShader=vertexHeader+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${vertexBody}`);
      shader.fragmentShader=fragmentHeader+shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${fragmentBody}`);
    };
    material.customProgramCacheKey=()=>key+'|orbit-hero-fracture-v1';
  }
  dispose(){this.texture.dispose();}
}
