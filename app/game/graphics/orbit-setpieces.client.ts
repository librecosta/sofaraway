import { orbitHeroGeometry, heroFamilies } from './orbit-geology';
export { orbitHeroGeometry } from './orbit-geology';
import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { cosmicPresence } from '../core/orbit-setpieces';
import type { CosmicBody, OrbitSetpiece } from '../core/orbit-setpieces';
import { astralProjection, cosmicNoise, nebulaFragment } from './orbit-cosmic-shaders';
import type { OrbitRocks } from './orbit-rocks.client';

const projectionVertex = /* glsl */`
varying vec2 vUv;
varying vec3 vLocal, vWorld;
void main() {
  vUv=uv; vLocal=position; vWorld=(modelMatrix*vec4(position,1.0)).xyz;
  vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
  gl_Position=projectionMatrix*mvPosition;
  ${astralProjection}
}`;

function rockMaterial() {
  const fade = { value: 1 };
  const material = new THREE.MeshStandardMaterial({ vertexColors:true, color:0x8e929b, roughness:.91, metalness:.055,
    transparent:true, depthWrite:true, fog:false });
  material.onBeforeCompile = shader => {
    shader.uniforms.cosmicPresence = fade;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${astralProjection}`);
    shader.fragmentShader = `uniform float cosmicPresence;\n${shader.fragmentShader}`.replace('#include <opaque_fragment>',
      'diffuseColor.a *= cosmicPresence;\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'orbit-cosmic-rock-v1';
  return { material, fade };
}

const planetFragment = /* glsl */`
${cosmicNoise}
uniform float presence, style, detail;
uniform vec3 sun;
varying vec2 vUv;
varying vec3 vLocal, vWorld;
void main() {
  vec3 normal=normalize(vLocal), eye=normalize(cameraPosition-vWorld);
  float mu=dot(normal,normalize(sun));
  float surface=gasFbm(vec2(atan(normal.z,normal.x)*3.0,normal.y*8.0),detail);
  if(style>1.5) {
    float limb=pow(max(.0,dot(normal,eye)),.35);
    gl_FragColor=vec4(vec3(1.8,1.10,.47)*(.7+.3*surface)*(.55+.45*limb),presence);
  } else {
    float stripes=sin(normal.y*53.0+surface*6.0)*.5+.5;
    vec3 color=style<.5 ? mix(vec3(.055,.063,.082),vec3(.16,.17,.19),surface)
      : mix(vec3(.07,.16,.24),vec3(.46,.37,.24),stripes*.7+surface*.3);
    float lit=smoothstep(-.10,.24,mu);
    color*=(style<.5?.22:.09)+1.45*lit;
    color+=vec3(.027,.043,.067)*pow(1.0-abs(dot(normal,eye)),3.0);
    gl_FragColor=vec4(color,presence);
  }
  #include <colorspace_fragment>
}`;
const atmosphereFragment = /* glsl */`
uniform float presence, style;
varying vec3 vLocal,vWorld;
void main(){
  float facing=abs(dot(normalize(vLocal),normalize(cameraPosition-vWorld)));
  float rim=style>1.5?exp(-pow((facing-.40)/.26,2.0))*smoothstep(0.0,.17,facing):pow(1.0-facing,3.5);
  vec3 tint=style>1.5?vec3(.85,.46,.13):style<.5?vec3(.34,.50,.73):vec3(.20,.49,.72);
  gl_FragColor=vec4(tint*rim*(style>1.5?.75:1.15),rim*.60*presence);
  #include <colorspace_fragment>
}`;

type ActivePiece = { group: THREE.Group; materials: THREE.Material[]; fade: { value:number };
  heroes: { mesh: THREE.Mesh; body: CosmicBody; lod:number }[]; batches: Map<number,THREE.InstancedMesh>;
  celestials: THREE.Mesh[];
  levels: Int8Array; quality?: QualityTier; instances:number; lastPosition:THREE.Vector3 };

/** Volume-owned macro geometry. Spatial windows overlap; no playback clock drives visibility. */
export class OrbitSetpieces {
  readonly group = new THREE.Group();
  private readonly active = new Map<string,ActivePiece>();
  private readonly heroes = Array.from({length:heroFamilies.length},(_,shape)=>Array.from({length:3},(_,lod)=>orbitHeroGeometry(shape,lod)));
  private readonly spheres = [new THREE.SphereGeometry(1,32,20),new THREE.SphereGeometry(1,64,40)];
  private readonly plane = new THREE.PlaneGeometry(1,1);
  private readonly transform = new THREE.Object3D();
  private readonly point = new THREE.Vector3();
  private station = 0;
  constructor(readonly descriptions: readonly OrbitSetpiece[], private readonly rocks: OrbitRocks) {}

  private create(piece: OrbitSetpiece) {
    const surface = rockMaterial();
    const item: ActivePiece = { group:new THREE.Group(), materials:[surface.material],fade:surface.fade, heroes:[],celestials:[], batches:new Map(),
      levels:new Int8Array(piece.rocks.length).fill(-1), instances:0,lastPosition:new THREE.Vector3(Infinity,Infinity,Infinity) };
    item.group.name = piece.name;
    for (const body of piece.bodies) {
      if (body.type==='hero') {
        const mesh = new THREE.Mesh(this.heroes[body.shape][2],surface.material);
        mesh.position.fromArray(body.position); mesh.scale.fromArray(body.scale); mesh.rotation.set(...body.rotation);
        mesh.frustumCulled=false; item.heroes.push({mesh,body,lod:2}); item.group.add(mesh);
      } else {
        const style = body.type==='moon'?0:body.type==='planet'?1:2;
        const sun = body.type==='moon' ? new THREE.Vector3().fromArray(piece.forward) : new THREE.Vector3(-.58,.55,.65);
        const uniforms = {presence:item.fade,style:{value:style},sun:{value:sun},detail:{value:3}};
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
        uniforms:{presence:item.fade,detail:{value:4},layer:{value:layer},seed:{value:(piece.seed%97)*.13}}});
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

  update(camera:THREE.PerspectiveCamera,station:number,height:number,quality:QualityTier) {
    this.station=station;
    const projection=height*camera.projectionMatrix.elements[5];
    for(const piece of this.descriptions) {
      const presence=cosmicPresence(piece,station);
      let item=this.active.get(piece.id);
      if(!item && presence>.0005) item=this.create(piece);
      if(!item)continue;
      item.fade.value=presence;item.group.visible=presence>.001;
      if(!item.group.visible && (station>piece.to+piece.feather || station<piece.from-piece.feather)) {
        this.free(item);this.active.delete(piece.id);continue;
      }
      for(const entry of item.heroes) {
        const {mesh,body}=entry;
        const pixels=projection*body.radius/camera.position.distanceTo(mesh.position);
        const lod=pixels>550*(entry.lod===0?.84:1)?0:pixels>130*(entry.lod===1?.84:1)?1:2;
        entry.lod=quality==='low'?Math.max(1,lod):lod;
        mesh.geometry=this.heroes[body.shape][entry.lod];
      }
      for(const material of item.materials)if(material instanceof THREE.ShaderMaterial && material.uniforms.detail)
        material.uniforms.detail.value=quality==='low'?2:quality==='high'?4:3;
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
      const previous=item.levels[i],near=quality==='low'?130:80,middle=quality==='low'?28:17;
      const lod=pixels>near*(previous===0?.84:1)?0:pixels>middle*(previous===1?.84:1)?1:2;
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
    instances:p.instances,objects:p.group.children.length,heroes:p.heroes.map(h=>heroFamilies[h.body.shape])})),landmarks:this.descriptions.map(p=>({id:p.id,station:p.station,anchor:p.anchor,bodies:p.bodies.length,rocks:p.rocks.length,structures:[...new Set(p.rocks.map(r=>r.structure))],nebula:p.nebula.map(n=>n.role)}))};}
  private free(item:ActivePiece){item.group.removeFromParent();for(const batch of item.batches.values())batch.dispose();for(const material of item.materials)material.dispose();}
  dispose(){for(const item of this.active.values())this.free(item);this.active.clear();for(const variants of this.heroes)for(const geometry of variants)geometry.dispose();for(const sphere of this.spheres)sphere.dispose();this.plane.dispose();}
}
