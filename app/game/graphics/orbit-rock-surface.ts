import * as THREE from 'three';
import type { QualityTier } from '../contracts';

const fade=(x:number)=>x*x*x*(x*(x*6-15)+10);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function gradient(x:number,y:number,z:number,seed:number,dx:number,dy:number,dz:number) {
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177)^seed;
  h=Math.imul(h^(h>>>13),1274126177);h=(h^(h>>>16))&15;
  const u=h<8?dx:dy,v=h<4?dy:h===12||h===14?dx:dz;
  return ((h&1)?-u:u)+((h&2)?-v:v);
}
/** Periodic gradient noise, baked once per world; no DOM or WebGL is needed. */
export function stoneNoise(x:number,y:number,z:number,period:number,seed:number) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
  const wrap=(v:number)=>(v%period+period)%period;
  const at=(a:number,b:number,c:number)=>gradient(wrap(ix+a),wrap(iy+b),wrap(iz+c),seed,fx-a,fy-b,fz-c);
  const u=fade(fx),v=fade(fy),w=fade(fz);
  return .5+.5*mix(mix(mix(at(0,0,0),at(1,0,0),u),mix(at(0,1,0),at(1,1,0),u),v),
    mix(mix(at(0,0,1),at(1,0,1),u),mix(at(0,1,1),at(1,1,1),u),v),w);
}
export function stoneVolume(size=32) {
  const data=new Uint8Array(size**3*4),periods=[4,7,11,5];
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<4;c++) {
    const p=periods[c],n=stoneNoise((x+.5)/size*p,(y+.5)/size*p,(z+.5)/size*p,p,1207+c*991);
    data[((z*size+y)*size+x)*4+c]=Math.round(Math.max(0,Math.min(1,n))*255);
  }
  return data;
}

const vertexHeader=/* glsl */`
attribute float rockFamily;
varying vec3 vStoneCoord,vStoneLocal;
varying float vStoneFamily,vStoneSize;
`;
const vertexBody=/* glsl */`
mat4 stoneTransform=modelMatrix;
#ifdef USE_INSTANCING
  stoneTransform=modelMatrix*instanceMatrix;
#endif
vec3 stoneScale=vec3(length(stoneTransform[0].xyz),length(stoneTransform[1].xyz),length(stoneTransform[2].xyz));
vStoneCoord=position*stoneScale+mod(stoneTransform[3].xyz,71.0);
vStoneLocal=position;vStoneFamily=rockFamily;vStoneSize=max(stoneScale.x,max(stoneScale.y,stoneScale.z));
`;
const fragmentHeader=/* glsl */`
uniform highp sampler3D stoneField;
uniform float stoneDetail,stonePixels;
varying vec3 vStoneCoord,vStoneLocal;
varying float vStoneFamily,vStoneSize;
float stoneBand(float phase) {
  float footprint=fwidth(phase);
  return (1.0-smoothstep(.06+footprint,.23+footprint,abs(sin(phase))))*(1.0-smoothstep(.35,1.3,footprint));
}
`;
const fragmentBody=/* glsl */`
// Object axes are measured in world units before interpolation. A true 3D field
// avoids UV/triplanar seams, even on the nonuniformly scaled instanced slabs.
vec4 bed=texture(stoneField,vStoneCoord*.0083);
vec4 grain=vec4(.5);
vec3 grainCoord=vStoneCoord*.047+bed.xyz*.18;
vec3 grainDx=dFdx(grainCoord),grainDy=dFdy(grainCoord);
vec3 microCoord=vStoneCoord*.085,microDx=dFdx(microCoord),microDy=dFdy(microCoord);
float footprint=max(length(dFdx(vStoneCoord)),length(dFdy(vStoneCoord)));
float stoneCoverage=2.0*vStoneSize*stonePixels/max(1.0,length(vViewPosition));
if(stoneDetail>.5&&footprint<3.0)grain=mix(vec4(.5),textureGrad(stoneField,grainCoord,grainDx,grainDy),1.0-smoothstep(1.5,3.0,footprint));
float pores=0.0;
if(stoneDetail>1.5&&footprint<.32)pores=smoothstep(.54,.72,textureGrad(stoneField,microCoord,microDx,microDy).b)*(1.0-smoothstep(.12,.32,footprint));
float cracks=0.0,strata=0.0,scar=0.0;
float phase=vStoneCoord.y*.28+bed.r*5.0;
if(vStoneFamily<.5) {
  cracks=stoneBand(vStoneCoord.x*.16+vStoneCoord.y*.047+bed.g*4.0);
  strata=stoneBand(vStoneCoord.y*.12+bed.r*2.0)*.45;
} else if(vStoneFamily<1.5) {
  float neck=exp(-pow(vStoneLocal.y*5.0,2.0));
  cracks=stoneBand(phase)*neck*.85;scar=neck*(.2+.8*grain.g);
} else if(vStoneFamily<2.5) {
  strata=stoneBand(phase+vStoneCoord.x*.045);
  cracks=stoneBand(vStoneCoord.x*.22+grain.r*3.0)*strata;
} else if(vStoneFamily<3.5) {
  float r=length((vStoneLocal.xy-vec2(.23,.14))*vec2(1.6,1.4));
  scar=exp(-pow((r-.44)*6.0,2.0));
  cracks=stoneBand(atan(vStoneLocal.y-.14,vStoneLocal.x-.23)*11.0+bed.g*2.0)*scar;
} else {
  cracks=stoneBand(vStoneCoord.x*.31+vStoneCoord.z*.22+bed.g*3.0);
  strata=stoneBand(vStoneCoord.y*.13+bed.r*3.0)*.35;
}
float cavity=clamp(cracks*.65+strata*.42+scar*.24+pores*.12,0.0,.85);
float mineral=smoothstep(.56,.72,bed.a)*smoothstep(.50,.68,grain.g);
float stoneHeight=(bed.r-.5)*1.1+(grain.r-.5)*.7-cracks*.20-strata*.18-scar*.14-pores*.04;
stoneHeight*=min(1.2,vStoneSize*.025);
vec3 sigmaX=dFdx(-vViewPosition),sigmaY=dFdy(-vViewPosition);
vec3 r1=cross(sigmaY,normal),r2=cross(normal,sigmaX);
float determinant=dot(sigmaX,r1);
vec3 gradient=sign(determinant)*(dFdx(stoneHeight)*r1+dFdy(stoneHeight)*r2);
// Bound the surface slope, including grazing views and narrow fissures.
// Unbounded derivative normals turn resolved pores into black pixel spikes.
float slopeDenominator=max(abs(determinant),max(1e-7,length(gradient)*1.8));
normal=normalize(normal-gradient*(.65/slopeDenominator));
diffuseColor.rgb*=mix(vec3(.88,.87,.85),vec3(1.11,1.06,.98),mineral)*(.92+bed.b*.16)*(1.0-cavity*.21);
roughnessFactor=clamp(.96-mineral*.27+grain.b*.05,.63,1.0);
metalnessFactor=.025+mineral*mineral*.12;
`;

/** One mipmapped volume and one program per existing material path, not per rock. */
let bakedStone:Uint8Array|undefined;
export class OrbitRockSurface {
  readonly texture=new THREE.Data3DTexture(bakedStone??=stoneVolume(64),64,64,64);
  private readonly detail={value:1};
  private readonly pixels={value:340};
  constructor() {
    this.texture.name='ORBIT geological field';
    this.texture.format=THREE.RGBAFormat;this.texture.type=THREE.UnsignedByteType;
    this.texture.wrapS=this.texture.wrapT=this.texture.wrapR=THREE.RepeatWrapping;
    this.texture.magFilter=THREE.LinearFilter;this.texture.minFilter=THREE.LinearMipmapLinearFilter;
    this.texture.generateMipmaps=true;this.texture.needsUpdate=true;
  }
  update(camera:THREE.PerspectiveCamera,height:number,quality:QualityTier) {
    this.detail.value=quality==='low'?0:quality==='auto'?1:2;
    this.pixels.value=height*camera.projectionMatrix.elements[5]*.5;
  }
  apply(material:THREE.MeshStandardMaterial) {
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      shader.uniforms.stoneField={value:this.texture};shader.uniforms.stoneDetail=this.detail;shader.uniforms.stonePixels=this.pixels;
      shader.vertexShader=vertexHeader+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${vertexBody}`);
      shader.fragmentShader=fragmentHeader+shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${fragmentBody}`);
    };
    material.customProgramCacheKey=()=>key+'|orbit-geology-v1';
  }
  dispose(){this.texture.dispose();}
}
