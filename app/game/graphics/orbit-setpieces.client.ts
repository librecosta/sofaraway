import { rockDetail } from './orbit-rock-detail';
import { orbitHeroGeometry, heroFamilies } from './orbit-geology';
export { orbitHeroGeometry } from './orbit-geology';
import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { cosmicPresence } from '../core/orbit-setpieces';
import type { CosmicBody, OrbitSetpiece } from '../core/orbit-setpieces';
import { astralProjection, cosmicNoise, nebulaFragment } from './orbit-cosmic-shaders';
import type { OrbitRocks } from './orbit-rocks.client';
import { OrbitSurfaceLights } from './orbit-light-rig';
import type { OrbitLighting } from '../core/orbit-lighting';

const projectionVertex = /* glsl */`
varying vec2 vUv;
varying vec3 vLocal, vWorld;
void main() {
  vUv=uv; vLocal=position; vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mvPosition;
  ${astralProjection}
}`;

function rockMaterial(surface:OrbitRocks['surface'],fade={value:1}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors:true, color:0x8e929b, roughness:.91, metalness:.055,
    transparent:true, depthWrite:true, fog:false });
  material.onBeforeCompile = shader => {
    shader.uniforms.cosmicPresence = fade;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${astralProjection}`);
    shader.fragmentShader = `uniform float cosmicPresence;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>',
      'diffuseColor.a *= cosmicPresence;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'orbit-cosmic-rock-v1';
  surface.apply(material);
  return { material, fade };
}

const planetFragment = /* glsl */`
${cosmicNoise}
uniform float presence, style, detail, celestialGain;
uniform highp sampler3D stoneField;
uniform vec3 sun;
varying vec2 vUv;
varying vec3 vLocal, vWorld;
void main() {
  vec3 normal=normalize(vLocal), eye=normalize(cameraPosition-vWorld);
  float mu=dot(normal,normalize(sun));
  vec4 cloud=texture(stoneField,normal*1.7+vec3(.31,.17,.63));
  float surface=cloud.r;
  if(style>1.5) {
    float limb=pow(max(.0,dot(normal,eye)),.35);
    gl_FragColor=vec4(vec3(1.22,.81,.36)*(.78+.22*surface)*(.52+.48*limb)*(1.0+(celestialGain-1.0)*.12),presence);
  } else {
    float jet=normal.y*38.0+cloud.g*6.0+sin(normal.x*5.0+normal.z*4.0)*.65;
    float stripes=.5+.5*sin(jet)*(1.0-smoothstep(.4,2.0,fwidth(jet)));
    float pole=smoothstep(.55,.92,abs(normal.y));
    float storm=exp(-pow((normal.y+.20)*9.0,2.0)-pow((normal.x-.48)*6.0,2.0))*smoothstep(.0,.4,normal.z);
    vec3 color=style<.5 ? mix(vec3(.055,.063,.082),vec3(.16,.17,.19),surface)
      : mix(vec3(.07,.16,.24),vec3(.46,.37,.24),stripes*.7+surface*.3);
    if(style>.5) {
      color=mix(color,vec3(.16,.24,.30),pole*.62);
      color=mix(color,vec3(.31,.19,.12),storm*.55);
      color*=.82+.42*cloud.b;
    }
    float lit=sqrt(max(0.0,mu))*smoothstep(-.02,.10,mu);
    color*=(style<.5?.22:.10)+1.40*lit;
    color+=vec3(.027,.043,.067)*pow(1.0-abs(dot(normal,eye)),3.0);
    gl_FragColor=vec4(color*(1.0+(celestialGain-1.0)*.20),presence);
  }
  #include <colorspace_fragment>
}`;
const atmosphereFragment = /* glsl */`
uniform float presence, style, celestialGain;
varying vec3 vLocal,vWorld;
void main(){
  float facing=abs(dot(normalize(vLocal),normalize(cameraPosition-vWorld)));
  float rim=style>1.5?exp(-pow((facing-.40)/.26,2.0))*smoothstep(0.0,.17,facing):pow(1.0-facing,3.5);
  vec3 tint=style>1.5?vec3(.85,.46,.13):style<.5?vec3(.34,.50,.73):vec3(.20,.49,.72);
  float angle=atan(vLocal.y,vLocal.x);
  float corona=.80+.12*sin(angle*7.0+sin(angle*3.0))+.08*sin(angle*17.0);
  float illumination=style>1.5?corona:.45+.55*max(0.0,dot(normalize(vLocal),normalize(vec3(-.58,.55,.65))));
  gl_FragColor=vec4(tint*rim*(style>1.5?.56:.92)*illumination*celestialGain,rim*.53*presence);
  #include <colorspace_fragment>
}`;

type ActivePiece = { group: THREE.Group; materials: THREE.Material[]; fade: { value:number };
  lights:OrbitSurfaceLights;
  heroes: { mesh: THREE.Mesh; body: CosmicBody; lod:number }[]; batches: Map<number,THREE.InstancedMesh>;
  celestials: THREE.Mesh[];
  levels: Int8Array; quality?: QualityTier; instances:number; lastPosition:THREE.Vector3 };

/** Volume-owned macro geometry. Spatial windows overlap; no playback clock drives visibility. */
export class OrbitSetpieces {
  readonly group = new THREE.Group();
  private readonly active = new Map<string,ActivePiece>();
  private readonly heroes = Array.from({length:heroFamilies.length},(_,shape)=>Array.from({length:2},(_,lod)=>orbitHeroGeometry(shape,lod)));
  private readonly spheres = [new THREE.SphereGeometry(1,32,20),new THREE.SphereGeometry(1,64,40)];
  private readonly plane = new THREE.PlaneGeometry(1,1);
  private readonly transform = new THREE.Object3D();
  private readonly point = new THREE.Vector3();
  private station = 0;
  constructor(readonly descriptions: readonly OrbitSetpiece[], private readonly rocks: OrbitRocks,private readonly sceneScale=1) {}

  private create(piece: OrbitSetpiece) {
    const surface = rockMaterial(this.rocks.surface);
    const lights=new OrbitSurfaceLights(piece,this.sceneScale);lights.apply(surface.material);
    const item: ActivePiece = { group:new THREE.Group(), materials:[surface.material],fade:surface.fade,lights, heroes:[],celestials:[], batches:new Map(),
      levels:new Int8Array(piece.rocks.length).fill(-1), instances:0,lastPosition:new THREE.Vector3(Infinity,Infinity,Infinity) };
    item.group.name = piece.name;
    const heroMaterial=piece.bodies.some(body=>body.type==='hero')?rockMaterial(this.rocks.surface,item.fade).material:null;
    if(heroMaterial){lights.apply(heroMaterial);item.materials.push(heroMaterial);}
    for (const body of piece.bodies) {
      if (body.type==='hero') {
        const mesh = new THREE.Mesh(this.heroes[body.shape][1],heroMaterial!);
        mesh.position.fromArray(body.position); mesh.scale.fromArray(body.scale); mesh.rotation.set(...body.rotation);
        mesh.frustumCulled=false; item.heroes.push({mesh,body,lod:1}); item.group.add(mesh);
      } else {
        const style = body.type==='moon'?0:body.type==='planet'?1:2;
        const sun = body.type==='moon' ? new THREE.Vector3().fromArray(piece.forward) : new THREE.Vector3(-.58,.55,.65);
        const uniforms = {stoneField:{value:this.rocks.surface.texture},presence:item.fade,style:{value:style},sun:{value:sun},detail:{value:3},celestialGain:{value:1}};
        const material = new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:planetFragment,uniforms,
          transparent:true,depthWrite:true});
        const mesh = new THREE.Mesh(this.spheres[0],material);item.celestials.push(mesh);
        mesh.position.fromArray(body.position); mesh.scale.fromArray(body.scale); mesh.frustumCulled=false;
        item.group.add(mesh); item.materials.push(material);
        {
          const air = new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:atmosphereFragment,
            uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
          const shell = new THREE.Mesh(this.spheres[0],air);item.celestials.push(shell);
          shell.position.copy(mesh.position);shell.scale.copy(mesh.scale).multiplyScalar(body.type==='star'?1.08:1.022);shell.frustumCulled=false;
          item.group.add(shell);item.materials.push(air);
        }
      }
    }
    for(const [layer,structure] of piece.nebula.entries()) {
      const material=new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:nebulaFragment,transparent:true,
        depthTest:true, depthWrite:false, premultipliedAlpha:true,
        uniforms:{presence:item.fade,detail:{value:4},layer:{value:layer},seed:{value:(piece.seed%97)*.13},
          choreoGain:{value:1},choreoHue:{value:0},choreoFiber:{value:0},choreoPhase:{value:0}}});
      const mesh=new THREE.Mesh(this.plane,material);
      const f=new THREE.Vector3().fromArray(piece.forward),r=new THREE.Vector3().fromArray(piece.right),u=new THREE.Vector3().fromArray(piece.up);
      mesh.name=structure.role;
      mesh.position.fromArray(piece.anchor).addScaledVector(r,structure.offset[0]).addScaledVector(u,structure.offset[1]).addScaledVector(f,structure.offset[2]);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r,u,f.negate()));
      mesh.rotateZ(structure.angle);mesh.scale.set(...structure.span,1);mesh.frustumCulled=false;
      item.group.add(mesh);item.materials.push(material);
    }
    this.group.add(item.group);this.active.set(piece.id,item);return item;
  }

  update(camera:THREE.PerspectiveCamera,station:number,height:number,quality:QualityTier,lighting?:OrbitLighting) {
    this.station=station;
    const projection=height*camera.projectionMatrix.elements[5];
    for(const piece of this.descriptions) {
      const presence=cosmicPresence(piece,station);
      let item=this.active.get(piece.id);
      if(!item && presence>.0005) item=this.create(piece);
      if(!item)continue;
      item.fade.value=presence;item.group.visible=presence>.001;
      if(lighting)item.lights.update(lighting);
      if(!item.group.visible && (station>piece.to+piece.feather || station<piece.from-piece.feather)) {
        this.free(item);this.active.delete(piece.id);continue;
      }
      for(const entry of item.heroes) {
        const {mesh,body}=entry;
        // A visible hero keeps a single surface; quality is an explicit user action.
        entry.lod=quality==='low'?1:0;
        mesh.geometry=this.heroes[body.shape][entry.lod];
      }
      for(const material of item.materials)if(material instanceof THREE.ShaderMaterial) {
        if(material.uniforms.detail)material.uniforms.detail.value=quality==='low'?2:quality==='high'?4:3;
        if(lighting&&material.uniforms.choreoGain){
          const layer=material.uniforms.layer.value;
          material.uniforms.choreoGain.value=lighting.nebula[layer];material.uniforms.choreoHue.value=lighting.hues[layer];
          material.uniforms.choreoFiber.value=lighting.fiber*(quality==='low'?.55:1);
          material.uniforms.choreoPhase.value=lighting.travel*Math.PI*2;
        }
        if(lighting&&material.uniforms.celestialGain)material.uniforms.celestialGain.value=piece.id==='planet'?lighting.planet:lighting.corona;
      }
      for(const mesh of item.celestials)mesh.geometry=this.spheres[quality==='low'?0:1];
      if(piece.rocks.length && (item.quality!==quality || item.lastPosition.distanceToSquared(camera.position)>16)) {
        this.populate(piece,item,camera.position,projection,quality);
        item.lastPosition.copy(camera.position);item.quality=quality;
      }
    }
  }

  private populate(piece:OrbitSetpiece,item:ActivePiece,camera:THREE.Vector3,projection:number,quality:QualityTier) {
    for(const batch of item.batches.values())batch.count=0;
    item.instances=0;
    const keep=quality==='low'?.27:quality==='high'?1:.6;
    for(let i=0;i<piece.rocks.length;i++) {
      const rock=piece.rocks[i]; if(rock.radius<5 && rock.rank>keep)continue;
      const pixels=projection*rock.radius/Math.max(1,this.point.fromArray(rock.position).distanceTo(camera));
      const lod=rockDetail(pixels,item.levels[i],quality,rock.radius);
      item.levels[i]=lod;
      const key=rock.shape*3+lod;
      let batch=item.batches.get(key);
      if(!batch){
        batch=new THREE.InstancedMesh(this.rocks.geometry(rock.shape,lod),item.materials[0],piece.rocks.filter(r=>r.shape===rock.shape).length);
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);batch.count=0;batch.frustumCulled=false;
        item.group.add(batch);item.batches.set(key,batch);
      }
      this.transform.position.fromArray(rock.position);this.transform.scale.fromArray(rock.scale);this.transform.rotation.set(...rock.rotation);this.transform.updateMatrix();
      batch.setMatrixAt(batch.count,this.transform.matrix);batch.setColorAt(batch.count++,this.rocks.colors[rock.material]);item.instances++;
    }
    for(const batch of item.batches.values()) {
      batch.visible=batch.count>0;batch.instanceMatrix.needsUpdate=true;
      if(batch.instanceColor)batch.instanceColor.needsUpdate=true;
    }
  }
  metrics(){return {station:this.station,active:[...this.active].filter(([,p])=>p.group.visible).map(([id,p])=>({id,presence:p.fade.value,
    instances:p.instances,objects:p.group.children.length,heroes:p.heroes.map(h=>heroFamilies[h.body.shape]),heroGeometry:p.heroes.map(h=>({id:h.body.id,lod:h.lod,vertices:h.mesh.geometry.attributes.position.count}))})),landmarks:this.descriptions.map(p=>({id:p.id,station:p.station,anchor:p.anchor,bodies:p.bodies.length,rocks:p.rocks.length,structures:[...new Set(p.rocks.map(r=>r.structure))],nebula:p.nebula.map(n=>n.role)}))};}
  private free(item:ActivePiece){item.group.removeFromParent();for(const batch of item.batches.values())batch.dispose();for(const material of item.materials)material.dispose();}
  dispose(){for(const item of this.active.values())this.free(item);this.active.clear();for(const variants of this.heroes)for(const geometry of variants)geometry.dispose();for(const sphere of this.spheres)sphere.dispose();this.plane.dispose();}
}
