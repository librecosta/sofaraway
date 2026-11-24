import { rockDetail } from './orbit-rock-detail';
import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { cosmicPresence } from '../core/orbit-setpieces';
import type { OrbitSetpiece } from '../core/orbit-setpieces';
import { auroraFrame } from '../core/orbit-nebula-structure';
import { astralProjection, nebulaFragment } from './orbit-cosmic-shaders';
import { bakeAuroraField } from './orbit-nebula-field';
import { aphelionAtmosphere, aphelionClouds, aphelionMoon, aphelionRingBounds, aphelionRings,
  aphelionShellScale, aphelionVertex } from './orbit-gas-giant.client';
import type { OrbitRocks } from './orbit-rocks.client';
import { OrbitSurfaceLights } from './orbit-light-rig';
import type { OrbitLighting } from '../core/orbit-lighting';
import { IMPOSSIBLE_SPEED_FACTOR } from '../core/difficulty';
import { BOOST_MULTIPLIER, cruiseTarget } from '../core/reference-motion';

// Allow six seconds of lead time even at the maximum Impossible Boost speed.
const AURORA_WARMUP_LEAD = 6 * cruiseTarget(Infinity) * BOOST_MULTIPLIER * IMPOSSIBLE_SPEED_FACTOR;

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

const celestialFragment = /* glsl */`
uniform float presence, style, celestialGain;
uniform highp sampler3D stoneField;
uniform vec3 sun;
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
    vec3 color=mix(vec3(.055,.063,.082),vec3(.16,.17,.19),surface);
    float lit=sqrt(max(0.0,mu))*smoothstep(-.02,.10,mu);
    color*=.22+1.40*lit;
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
  vec3 tint=style>1.5?vec3(.85,.46,.13):vec3(.34,.50,.73);
  float angle=atan(vLocal.y,vLocal.x);
  float corona=.80+.12*sin(angle*7.0+sin(angle*3.0))+.08*sin(angle*17.0);
  float illumination=style>1.5?corona:.45+.55*max(0.0,dot(normalize(vLocal),normalize(vec3(-.58,.55,.65))));
  gl_FragColor=vec4(tint*rim*(style>1.5?.56:.92)*illumination*celestialGain,rim*.53*presence);
  #include <colorspace_fragment>
}`;

type ActivePiece = { group: THREE.Group; materials: THREE.Material[]; fade: { value:number };
  lights:OrbitSurfaceLights;
  batches: Map<number,THREE.InstancedMesh>;
  celestials: THREE.Mesh[];
  rings?: THREE.Mesh;
  nebulaField?: THREE.DataArrayTexture;
  nebulaMaterial?: THREE.ShaderMaterial;
  boulderIndices: number[]; levels: Int8Array; quality?: QualityTier; instances:number; lastPosition:THREE.Vector3 };

/** Volume-owned macro geometry. Spatial windows overlap; no playback clock drives visibility. */
export class OrbitSetpieces {
  readonly group = new THREE.Group();
  private readonly active = new Map<string,ActivePiece>();
  private readonly spheres = [new THREE.SphereGeometry(1,32,20),new THREE.SphereGeometry(1,64,40)];
  private readonly ringGeometry = new THREE.RingGeometry(...aphelionRingBounds, 128).rotateX(-Math.PI / 2);
  private readonly plane = new THREE.PlaneGeometry(1,1);
  private readonly transform = new THREE.Object3D();
  private readonly point = new THREE.Vector3();
  private station = 0;
  private readonly aurora: OrbitSetpiece | undefined;
  private readonly aphelion: OrbitSetpiece | undefined;
  private readonly warmedOutputs = new Set<string>();
  private readonly warmedAphelion = new Map<string, THREE.BufferGeometry>();

  constructor(readonly descriptions: readonly OrbitSetpiece[], private readonly rocks: OrbitRocks,private readonly sceneScale=1) {
    this.aurora = descriptions.find(piece => piece.id === 'nebula');
    this.aphelion = descriptions.find(piece => piece.id === 'planet');
  }

  warmAurora(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, lights: readonly THREE.Light[], preparing: boolean) {
    const piece = this.aurora;
    if (!piece || (!preparing && (this.station < piece.from - AURORA_WARMUP_LEAD || this.station > piece.to))) return;
    const output = target ? `${target.texture.type}:${target.samples}` : renderer.outputColorSpace;
    if (this.warmedOutputs.has(output)) return;
    const item = this.active.get(piece.id) ?? this.create(piece);
    if (!item.nebulaMaterial) return;

    const probe = new THREE.Scene();
    const mesh = new THREE.Mesh(this.plane, item.nebulaMaterial);
    mesh.position.z = -.5;
    probe.add(mesh);
    this.primeCelestial(renderer, target, lights, probe, item.fade);
    this.warmedOutputs.add(output);
  }

  warmAphelion(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, lights: readonly THREE.Light[],
    quality: QualityTier, preparing: boolean) {
    const piece = this.aphelion;
    if (!piece || (!preparing && (this.station < piece.from - AURORA_WARMUP_LEAD || this.station > piece.to))) return;
    const output = target ? `${target.texture.type}:${target.samples}` : renderer.outputColorSpace;
    const geometry = this.spheres[quality === 'low' ? 0 : 1];
    if (this.warmedAphelion.get(output) === geometry) return;
    const item = this.active.get(piece.id) ?? this.create(piece);
    const probe = new THREE.Scene();
    for (const celestial of [...item.celestials, item.rings!]) {
      const mesh = new THREE.Mesh(celestial === item.rings ? this.ringGeometry : geometry, celestial.material);
      mesh.position.z = -2.5;
      mesh.position.x = (probe.children.length % 2 === 0 ? -.8 : .8);
      mesh.scale.setScalar(.55);
      if (celestial === item.rings) mesh.rotation.x = Math.PI / 2;
      probe.add(mesh);
    }
    this.primeCelestial(renderer, target, lights, probe, item.fade);
    this.warmedAphelion.set(output, geometry);
  }

  private primeCelestial(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null,
    lights: readonly THREE.Light[], probe: THREE.Scene, fade: { value: number }) {
    // Match the production target and light counts, which are part of Three's
    // program key even for these unlit materials.
    probe.add(...lights.map(light => light.clone()));
    const camera = new THREE.PerspectiveCamera(60, 1, .1, 10);
    const previous = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const autoClear = renderer.autoClear;
    const presence = fade.value;
    try {
      fade.value = 0;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setViewport(0, 0, 4, 4);
      renderer.render(probe, camera);
    } finally {
      fade.value = presence;
      renderer.autoClear = autoClear;
      renderer.setViewport(viewport);
      renderer.setRenderTarget(previous, previousFace, previousMip);
    }
  }

  private create(piece: OrbitSetpiece) {
    const surface = rockMaterial(this.rocks.surface);
    const lights=new OrbitSurfaceLights(piece,this.sceneScale);lights.apply(surface.material);
    const item: ActivePiece = { group:new THREE.Group(), materials:[surface.material],fade:surface.fade,lights, celestials:[], batches:new Map(),
      boulderIndices: piece.rocks.flatMap((rock, index) => rock.structure.endsWith('-boulder') ? [index] : []),
      levels:new Int8Array(piece.rocks.length).fill(-1), instances:0,lastPosition:new THREE.Vector3(Infinity,Infinity,Infinity) };
    item.group.name = piece.name;
    if (piece === this.aphelion) this.createAphelion(piece, item);
    else for (const body of piece.bodies) {
      const sun = body.type==='moon' ? new THREE.Vector3().fromArray(piece.forward) : new THREE.Vector3(-.58,.55,.65).normalize();
      const uniforms = {presence:item.fade,sun:{value:sun},celestialGain:{value:1},
        stoneField:{value:this.rocks.surface.texture},style:{value:body.type==='moon'?0:2}};
      const material = new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:celestialFragment,uniforms,
        transparent:true,depthWrite:true});
      const mesh = new THREE.Mesh(this.spheres[0],material);item.celestials.push(mesh);
      mesh.position.fromArray(body.position); mesh.scale.fromArray(body.scale); mesh.frustumCulled=false;
      item.group.add(mesh); item.materials.push(material);
      const air = new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:atmosphereFragment,
        uniforms,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
      const shell = new THREE.Mesh(this.spheres[0],air);item.celestials.push(shell);
      shell.position.copy(mesh.position);shell.quaternion.copy(mesh.quaternion);
      shell.scale.copy(mesh.scale).multiplyScalar(body.type==='star'?1.08:1.022);shell.frustumCulled=false;
      item.group.add(shell);item.materials.push(air);
    }
    if (piece.nebula.length) item.nebulaField = bakeAuroraField(piece.seed);
    const f = new THREE.Vector3().fromArray(piece.forward);
    const u = new THREE.Vector3().fromArray(piece.up);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().fromArray(piece.right), u, f.clone().negate());
    for(const [layer,structure] of piece.nebula.entries()) {
      const material=new THREE.ShaderMaterial({vertexShader:projectionVertex,fragmentShader:nebulaFragment,transparent:true,
        depthTest:true, depthWrite:false, premultipliedAlpha:true,
        uniforms:{presence:item.fade,detail:{value:4},layer:{value:layer},seed:{value:(piece.seed%97)*.13},inspection:{value:0},
          structuralField:{value:item.nebulaField},flowNoise:{value:this.rocks.surface.texture},
          choreoGain:{value:1},choreoHue:{value:0},choreoFiber:{value:0},choreoPhase:{value:0}}});
      const mesh=new THREE.Mesh(this.plane,material);
      item.nebulaMaterial ??= material;
      mesh.name=structure.role;
      mesh.position.fromArray(piece.anchor).addScaledVector(u,auroraFrame.lift).addScaledVector(f,structure.depth);
      mesh.quaternion.setFromRotationMatrix(basis);
      mesh.scale.set(auroraFrame.width,auroraFrame.height,1);mesh.frustumCulled=false;
      item.group.add(mesh);item.materials.push(material);
    }
    if (piece !== this.aurora && piece !== this.aphelion) this.group.add(item.group);
    this.active.set(piece.id,item);return item;
  }

  private createAphelion(piece: OrbitSetpiece, item: ActivePiece) {
    const [planet, moon] = piece.bodies;
    const orientation = new THREE.Euler(.23, 0, -.25, 'ZYX');
    const ringNormal = new THREE.Vector3(0, 1, 0).applyEuler(orientation);
    const seed = piece.seed >>> 0;
    const uniforms = {
      presence: item.fade,
      celestialGain: { value: 1 },
      detail: { value: 3 },
      cloudField: { value: this.rocks.surface.texture },
      cloudSeed: { value: new THREE.Vector3(.19 + (seed & 255)/1024, .27 + ((seed >>> 8) & 255)/1024, .43 + ((seed >>> 16) & 255)/1024) },
      sun: { value: new THREE.Vector3(-.58, .55, .65).normalize() },
      ringNormal: { value: ringNormal },
      planetCenter: { value: new THREE.Vector3().fromArray(planet.position) },
      planetRadius: { value: planet.radius },
    };
    const globe = (name: string, body: typeof planet, fragmentShader: string, shell = false) => {
      const material = new THREE.ShaderMaterial({vertexShader:aphelionVertex, fragmentShader, uniforms,
        transparent:true, depthWrite:!shell, blending:shell ? THREE.AdditiveBlending : THREE.NormalBlending});
      const mesh = new THREE.Mesh(this.spheres[0], material);
      mesh.name = name;
      mesh.position.fromArray(body.position);
      mesh.scale.fromArray(body.scale).multiplyScalar(shell ? aphelionShellScale : 1);
      mesh.rotation.copy(body === planet ? orientation : new THREE.Euler(.12, -.25, .11));
      mesh.frustumCulled = false;
      // Draw distant solid bodies before their transparent optics and foreground nebula.
      mesh.renderOrder = shell ? -2 : -3;
      item.group.add(mesh);
      item.celestials.push(mesh);
      item.materials.push(material);
    };
    globe('Aphelion gas giant', planet, aphelionClouds);
    globe('Aphelion atmosphere', planet, aphelionAtmosphere, true);
    globe('Aphelion companion', moon, aphelionMoon);
    const material = new THREE.ShaderMaterial({vertexShader:aphelionVertex, fragmentShader:aphelionRings, uniforms,
      transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true});
    const rings = new THREE.Mesh(this.ringGeometry, material);
    rings.name = 'Aphelion rings';
    rings.position.copy(uniforms.planetCenter.value);
    rings.scale.setScalar(planet.radius);
    rings.rotation.copy(orientation);
    rings.renderOrder = -1;
    rings.frustumCulled = false;
    item.group.add(rings);
    item.rings = rings;
    item.materials.push(material);
  }

  update(camera:THREE.PerspectiveCamera,station:number,height:number,quality:QualityTier,lighting?:OrbitLighting,inspection=0) {
    this.station=station;
    const projection=height*camera.projectionMatrix.elements[5];
    for(const piece of this.descriptions) {
      const presence=cosmicPresence(piece,station);
      let item=this.active.get(piece.id);
      if(!item && presence>.0005) item=this.create(piece);
      if(!item)continue;
      item.fade.value=presence;item.group.visible=presence>.001;
      // Keep the small, fixed nebula alive across seeks without submitting it outside its fade.
      if (piece === this.aurora || piece === this.aphelion) {
        if (!item.group.visible) {
          item.group.removeFromParent();
          continue;
        }
        if (!item.group.parent) this.group.add(item.group);
      }
      if(lighting)item.lights.update(lighting);
      if(!item.group.visible && (station>piece.to+piece.feather || station<piece.from-piece.feather)) {
        this.free(item);this.active.delete(piece.id);continue;
      }
      for(const material of item.materials)if(material instanceof THREE.ShaderMaterial) {
        if(material.uniforms.detail)material.uniforms.detail.value=quality==='low'?2:quality==='high'?4:3;
        if(lighting&&material.uniforms.choreoGain){
          const layer=material.uniforms.layer.value;
          material.uniforms.inspection.value=inspection;
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
    instances:p.instances,objects:p.group.children.length,boulders:p.boulderIndices.map(index=>{
      const rock=this.descriptions.find(piece=>piece.id===id)!.rocks[index];
      return {id:rock.id,shape:rock.shape,lod:p.levels[index]};
    })})),landmarks:this.descriptions.map(p=>({id:p.id,station:p.station,anchor:p.anchor,bodies:p.bodies.length,rocks:p.rocks.length,structures:[...new Set(p.rocks.map(r=>r.structure))],nebula:p.nebula.map(n=>n.role)}))};}
  private free(item:ActivePiece){item.group.removeFromParent();for(const batch of item.batches.values())batch.dispose();
    for(const material of item.materials)material.dispose();item.nebulaField?.dispose();}
  dispose(){for(const item of this.active.values())this.free(item);this.active.clear();for(const sphere of this.spheres)sphere.dispose();this.ringGeometry.dispose();this.plane.dispose();}
}
