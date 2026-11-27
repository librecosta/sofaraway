import * as THREE from 'three';
import type { OrbitLighting } from '../core/orbit-lighting';
import type { OrbitSetpiece } from '../core/orbit-setpieces';

/** Uniform-only response on existing opaque rock surfaces. No emissive overlay,
 * generated particles, extra light, new geometry or per-instance buffer updates. */
export class OrbitSurfaceLights {
  readonly music={value:new THREE.Vector4()};
  constructor(private readonly piece:OrbitSetpiece,private readonly scale:number) {}
  update(state:OrbitLighting) {
    this.music.value.set(state.face,state.ring,state.storm,state.travel*Math.PI*2);
  }
  apply(material:THREE.MeshStandardMaterial) {
    const previous=material.onBeforeCompile,key=material.customProgramCacheKey(),piece=this.piece;
    const role=['monolith','fractures','ring','spiral','eclipse','nebula','planet'].indexOf(piece.id);
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      Object.assign(shader.uniforms,{cosmicMusic:this.music,cosmicRole:{value:role},cosmicScale:{value:this.scale},
        cosmicOrigin:{value:new THREE.Vector3(...piece.anchor)},cosmicRight:{value:new THREE.Vector3(...piece.right)},
        cosmicUp:{value:new THREE.Vector3(...piece.up)},cosmicForward:{value:new THREE.Vector3(...piece.forward)}});
      shader.vertexShader=/* glsl */`varying vec3 vCosmicPoint;
        uniform vec3 cosmicOrigin,cosmicRight,cosmicUp,cosmicForward;
        ${shader.vertexShader}`.replace('#include <begin_vertex>',/* glsl */`#include <begin_vertex>
        mat4 cosmicTransform=modelMatrix;
        #ifdef USE_INSTANCING
          cosmicTransform=modelMatrix*instanceMatrix;
        #endif
        vec3 cosmicWorld=(cosmicTransform*vec4(position,1.0)).xyz-cosmicOrigin;
        vCosmicPoint=vec3(dot(cosmicWorld,cosmicRight),dot(cosmicWorld,cosmicUp),dot(cosmicWorld,cosmicForward));`);
      shader.fragmentShader=/* glsl */`varying vec3 vCosmicPoint;uniform vec4 cosmicMusic;
        uniform float cosmicRole,cosmicScale;
        ${shader.fragmentShader}`.replace('#include <opaque_fragment>',/* glsl */`
        vec3 local=vCosmicPoint/max(.1,cosmicScale);
        float side=.35+.65*smoothstep(-.5,.8,normal.y*.4+normal.z*.6);
        float response=cosmicMusic.x*(.35+.65*smoothstep(-90.0,100.0,local.x));
        vec3 tint=vec3(.93,1.03,1.08);
        if(cosmicRole>1.5&&cosmicRole<2.5){
          float angle=atan((local.y-217.0)/.77,local.x);
          float arc=pow(.5+.5*cos(angle-cosmicMusic.w),5.0);
          response=cosmicMusic.y*(.16+.84*arc);
          tint=mix(vec3(.86,1.02,1.12),vec3(1.10,1.02,.87),.5+.5*cos(angle+1.2));
        }else if(cosmicRole>2.5&&cosmicRole<3.5){
          float stream=atan(local.y/.78,local.x)-local.z*.012;
          response=cosmicMusic.z*(.15+.85*pow(.5+.5*cos(stream-cosmicMusic.w),3.0));
          tint=mix(vec3(.85,1.05,1.13),vec3(1.02,.91,1.10),.5+.5*cos(stream+2.1));
        }
        outgoingLight*=1.0+response*side;
        outgoingLight=mix(outgoingLight,outgoingLight*tint,min(.22,response*.65));
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>key+'|starwake-surface-light-v1';
  }
}
