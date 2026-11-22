import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { asteroidSurfaceVolume,stoneVolume } from './orbit-surface-field';
import { asteroidLithologies } from './orbit-lithology';
export { stoneNoise,stoneVolume } from './orbit-surface-field';

const vertexHeader=/* glsl */`
attribute vec4 heroFeatures;
attribute vec3 heroCoord;
attribute float rockFamily;
varying vec4 vStoneFeatures;
varying vec3 vStoneCoord,vStoneLocal,vStoneTag;
varying float vStoneFamily,vStoneSize;
`;
const vertexBody=/* glsl */`
mat4 stoneTransform=modelMatrix;
#ifdef USE_INSTANCING
  stoneTransform=modelMatrix*instanceMatrix;
#endif
vec3 stoneScale=vec3(length(stoneTransform[0].xyz),length(stoneTransform[1].xyz),length(stoneTransform[2].xyz));
// Bounded local shape coordinates and scaled local meters avoid UV seams and
// large world-coordinate precision loss. Translation only selects a stable field.
vStoneCoord=position*stoneScale;
vStoneLocal=heroCoord;vStoneFeatures=heroFeatures;vStoneFamily=rockFamily;
vStoneTag=fract(mod(stoneTransform[3].xyz,71.0)*vec3(.1031,.11369,.13787)+rockFamily*.173);
vStoneSize=max(stoneScale.x,max(stoneScale.y,stoneScale.z));
`;
const profileGLSL=asteroidLithologies.map((p,i)=>`${i?'else ':''}if(lithology<${(i+.5).toFixed(1)}) {
  weights=vec3(${p.fracture.toFixed(3)},${p.clast.toFixed(3)},${p.pit.toFixed(3)});
  baseRoughness=${p.roughness.toFixed(3)};baseAlbedo=${p.albedo.toFixed(3)};
}`).join('\n');
const fragmentHeader=/* glsl */`
uniform highp sampler3D asteroidField;
uniform float stoneDetail,stonePixels;
varying vec4 vStoneFeatures;
varying vec3 vStoneCoord,vStoneLocal,vStoneTag;
varying float vStoneFamily,vStoneSize;
`;
const fragmentBody=/* glsl */`
float stoneCoverage=2.0*vStoneSize*stonePixels/max(1.0,length(vViewPosition));
float lithology=floor(fract(dot(vStoneTag,vec3(.31,.47,.23))+vStoneFamily*.271)*4.0);
vec3 weights=vec3(0.0);float baseRoughness=.94,baseAlbedo=1.0;
${profileGLSL}
vec3 jointCoord=vStoneLocal*.58+vStoneTag;
vec4 rock=texture(asteroidField,jointCoord);
float footprint=max(length(dFdx(vStoneCoord)),length(dFdy(vStoneCoord)));
float resolved=1.0-smoothstep(.065,.20,max(length(dFdx(jointCoord)),length(dFdy(jointCoord))));
resolved*=smoothstep(6.0,24.0,stoneCoverage);
float fresh=vStoneFeatures.x,fault=vStoneFeatures.y,peel=vStoneFeatures.z,weather=vStoneFeatures.w;
float edgeWidth=max(fwidth(rock.r),.014);
float joint=1.0-smoothstep(.022-edgeWidth,.075+edgeWidth,rock.r);
// Patches interrupt polygonal joints. Broad fresh faces remain quiet; finite
// geometry masks supply primary faults and exfoliation, never repeating bands.
float region=smoothstep(.37,.67,rock.b)*(1.0-fresh*.78);
if(vStoneFamily>.5&&vStoneFamily<1.5)region*=.35+.65*exp(-vStoneLocal.y*vStoneLocal.y*7.0);
float cracks=joint*region*weights.x*resolved;
float clast=(1.0-smoothstep(.17,.28,rock.a))*smoothstep(.44,.63,rock.b)*weights.y*resolved;
float pit=(1.0-smoothstep(.20,.35,rock.a))*(1.0-smoothstep(.35,.53,rock.b))*weights.z*resolved;
vec3 grainCoord=vStoneCoord*.034+vStoneTag;
vec3 grainDx=dFdx(grainCoord),grainDy=dFdy(grainCoord);
vec3 microCoord=vStoneCoord*.13+vStoneTag.yzx;
vec3 microDx=dFdx(microCoord),microDy=dFdy(microCoord);
float grainWeight=(1.0-smoothstep(.5,2.2,footprint))*smoothstep(12.0,48.0,stoneCoverage);
grainWeight*=stoneDetail>.5?1.0:.45;
vec4 grain=vec4(.5);
if(grainWeight>.001)grain=mix(vec4(.5),textureGrad(asteroidField,grainCoord,grainDx,grainDy),grainWeight);
float microWeight=(1.0-smoothstep(.10,.5,footprint))*smoothstep(24.0,90.0,stoneCoverage);
microWeight*=stoneDetail>1.5?1.0:stoneDetail>.5?.4:0.0;
float micro=.5;
if(microWeight>.001)micro=mix(.5,textureGrad(asteroidField,microCoord,microDx,microDy).g,microWeight);
float pore=smoothstep(.65,.82,grain.a)*smoothstep(.48,.65,grain.b)*grainWeight*(.35+weights.y*.65);
float height=(rock.b-.5)*.30*resolved+(grain.g-.5)*.55+(micro-.5)*.09
  -cracks*.30-fault*.30-peel*.08+clast*.16-pit*.22-pore*.045;
height*=min(1.0,vStoneSize*.08);
vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
vec3 r1=cross(dy,normal),r2=cross(normal,dx);
float det=dot(dx,r1);
vec3 slope=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
normal=normalize(normal-slope*(.65/max(abs(det),max(1e-7,length(slope)*2.4))));
float cavity=clamp(cracks*.22+fault*.26+peel*.08+pit*.18+pore*.04,0.0,.36);
float mineral=smoothstep(.69,.83,rock.b)*smoothstep(.59,.74,grain.g)*(1.0-weather);
diffuseColor.rgb*=mix(vec3(.94,.93,.91),vec3(1.04,1.03,1.01),fresh)*baseAlbedo
  *(.94+rock.b*.12)*(.96+grain.b*.08)*(1.0-cavity)*(1.0+clast*.12);
roughnessFactor=clamp(baseRoughness+weather*.035-fresh*.12-peel*.025+(.5-grain.g)*.07-clast*.04,.72,.99);
metalnessFactor=.015+mineral*.035;
`;

let bakedStone:Uint8Array|undefined,bakedAsteroid:Uint8Array|undefined;
function field(data:Uint8Array,name:string) {
  const texture=new THREE.Data3DTexture(data,64,64,64);texture.name=name;
  texture.format=THREE.RGBAFormat;texture.type=THREE.UnsignedByteType;
  texture.wrapS=texture.wrapT=texture.wrapR=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
/** One surface field and shader for debris, supporting rocks and fixed heroes.
 * Celestial clouds retain their unchanged legacy texels and independent mapping. */
export class OrbitRockSurface {
  readonly texture=field(bakedStone??=stoneVolume(64),'ORBIT celestial noise');
  readonly asteroidTexture=field(bakedAsteroid??=asteroidSurfaceVolume(),'ORBIT shared asteroid surface');
  private readonly detail={value:1};
  private readonly pixels={value:340};
  update(camera:THREE.PerspectiveCamera,height:number,quality:QualityTier) {
    this.detail.value=quality==='low'?0:quality==='auto'?1:2;
    this.pixels.value=height*camera.projectionMatrix.elements[5]*.5;
  }
  apply(material:THREE.MeshStandardMaterial) {
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      shader.uniforms.asteroidField={value:this.asteroidTexture};shader.uniforms.stoneDetail=this.detail;shader.uniforms.stonePixels=this.pixels;
      shader.vertexShader=vertexHeader+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\n${vertexBody}`);
      shader.fragmentShader=fragmentHeader+shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>\n${fragmentBody}`);
    };
    material.customProgramCacheKey=()=>key+'|orbit-asteroid-surface-v2';
  }
  dispose(){this.texture.dispose();this.asteroidTexture.dispose();}
}
