import * as THREE from 'three';
import { canPass, playerViewOffset } from '../core/collision';
import { facilityZones } from '../core/descent-facility';
import { gameplayFor } from '../core/gameplay';
import { modeScale } from '../core/reference-track';
import { makeAfterglowAtlas, makeLightingAtlas } from '../core/lighting-atlas';
import { ease, routeTone, scoreTone } from '../core/lighting-score';
import { steadyLights } from '../core/rhythmic-lights';
import type { RunGate, Simulation } from '../core/simulation';
import type { EncoreGate, OutroPlan } from '../core/encore';
import type { VolumeDefinition } from '../core/volumes';
import type { Diagnostics, PlayMode, QualityTier } from '../contracts';
import { BranchVisual, prepareJunctionPrograms } from './branch.client';
import { CorridorLights } from './corridor-lights.client';
import type { LightingPreview } from './corridor-lights.client';
import { DaybreakExterior } from './daybreak-exterior.client';
import { DescentFacility } from './descent-facility.client';
import { descentRouteSwatches } from '../core/descent-routes';
import type { DescentJunction } from './descent-junction';
import type { CirrusLayer } from './daybreak-cirrus';
import { makeDaybreakEnvMap, makeEnvMap } from './environment.client';
import { GateGeometries, GateVisual, THICKNESS } from './gates.client';
import { glassMicroContrast } from './glass-optics';
import { MaterialLibrary } from './materials/library.client';
import type { OrbitDensity } from '../core/orbit-field';
import { ORBIT_WORLD_SEED } from '../core/orbit-field';
import { OrbitWorld } from './orbit-world.client';
import { OrbitRouteGuides } from './orbit-route-guides.client';
import { orbitRouteSwatches } from '../core/orbit-routes';
import { buildRunPath } from './path';
import type { Path, PathFrame } from './path';
import { PickupVisual } from './pickup.client';
import { PostFX } from './post.client';
import { readCapabilities, selectProfile } from './quality';
import type { QualityProfile } from './quality';
import { RouteHologram } from './route-hologram.client';
import { buildTextures } from './textures.client';
import { Tunnel } from './tunnel.client';

const frame = () => ({
  p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(),
});
const BASE_FOV = 76;
type SceneGate = RunGate | EncoreGate;
interface OrbitView { station: number; x: number; y: number; time: number }
export type SceneState = Pick<Simulation, 'camera' | 'trackDistance' | 'distance' | 'beat' | 'time' | 'phase' |
  'mode' | 'route' | 'branch' | 'branchGates' | 'junctionPath' | 'steeringWidth' | 'routeGuide' | 'routeSide' |
  'previewGates' | 'previewEncore' | 'outroPlan' | 'speed' | 'boostLens' | 'boosting' | 'hitTime' |
  'pickup' | 'pickupVisible' | 'pickupStation' | 'pickupPreviewStation'> & { escapeWhite?: number };

export class UnsupportedGraphics extends Error {}

class ShaderFailure extends Error {}

class VolumeScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 420);
  readonly tunnel?: Tunnel;
  readonly orbit?: OrbitWorld;
  private orbitGuides?: OrbitRouteGuides;
  readonly hologram?: RouteHologram;
  readonly scenic?: CorridorLights;
  private readonly fog = new THREE.FogExp2(0, 0.0062);
  private readonly routeFog = new THREE.Color();
  private readonly daylightFog = new THREE.Color(0xffd8a7);
  private readonly gateGeometries = new GateGeometries();
  get gateGeometryCache() { return this.gateGeometries.size; }
  private readonly visuals = new Map<SceneGate, GateVisual>();
  private outro?: OutroPlan;
  readonly exterior?: DaybreakExterior;
  private readonly facility?: DescentFacility;
  private readonly facilityBackground?: THREE.Color;
  private readonly gateTint = new THREE.Color();
  private readonly cameraFrame = frame();
  private readonly gateFrame = frame();
  private readonly pickupFrame = frame();
  private readonly backwards = new THREE.Vector3();
  private readonly gateTarget = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private hue = 0;
  private saturation = 1;
  private phase?: Simulation['phase'];
  private pickup?: PickupVisual;
  private junction?: BranchVisual | DescentJunction;
  private disposeJunctionPrograms?: () => void;
  private readonly surfaceLibrary?: MaterialLibrary;
  private readonly gameplay;

  constructor(private readonly volume: VolumeDefinition | null, textures: ReturnType<typeof buildTextures> | MaterialLibrary | undefined,
    environmentFor: (sun?: THREE.Vector3) => THREE.Texture | null, readonly path: Path, mode: PlayMode,
    orbit?: { seed: number; density: OrbitDensity }) {
    const astral = orbit ?? (volume?.topology === 'orbit' ? { seed: ORBIT_WORLD_SEED, density: 'flight' as const } : undefined);
    if (astral) {
      this.camera.far = 680;
      this.camera.updateProjectionMatrix();
      this.orbit = new OrbitWorld(path, astral.seed, astral.density, mode);
      this.scene.add(this.orbit.group);
    }
    if (!volume) return;
    this.hue = volume.hue[0];
    this.gameplay = gameplayFor(volume.id);
    if (this.orbit) {
      if (this.gameplay.branch) this.hologram = new RouteHologram(false, orbitRouteSwatches);
      return;
    }
    if (this.gameplay.world?.continuous) {
      this.camera.far = 1800;
      this.camera.updateProjectionMatrix();
    }
    this.surfaceLibrary = textures instanceof MaterialLibrary ? textures : undefined;
    this.scene.fog = this.fog;
    try {
      const atlas = makeLightingAtlas(volume, mode);
      if (volume.topology === 'facility') {
        this.facility = new DescentFacility(path, facilityZones(volume, mode, path.reference));
        this.facilityBackground = new THREE.Color(0x111720);
        this.fog.density = .0055;
      }
      this.tunnel = new Tunnel(textures, this.path, volume.topology, atlas, this.gameplay.world?.continuous, this.facility);
      this.scene.add(this.tunnel.group);
      if (volume.id === 'daybreak') {
        this.exterior = new DaybreakExterior(path);
        this.scene.add(this.exterior.mesh);
        this.tunnel.setSunDirection(this.exterior.sun);
        this.fog.density = .00245;
      } else if (this.facilityBackground) this.scene.background = this.facilityBackground;
      this.scene.environment = environmentFor(this.exterior?.sun);
      if (this.exterior) this.scene.environmentIntensity = .90;
      if (this.facility) this.scene.environmentIntensity = .66;
      if (volume.id === 'elsewhere') {
        // Keep the existing PMREM and temper its contribution under the new local rig.
        this.scene.environmentIntensity = 1.56;
        this.scenic = new CorridorLights(path, atlas, mode);
        this.scene.add(this.scenic.group);
        for (const material of this.tunnel.surfaceMaterials ?? []) {
          // Reuse the same sRGB albedo to give unlit metal a restrained diffuse floor.
          // This is a scene-local response; M0's maps and inspection materials do not change.
          material.emissiveMap = material.map;
          material.emissiveIntensity = material.name === 'floor-grip' ? .26 : .36;
          material.emissive.copy(this.scenic.base);
        }
      }
      if (this.gameplay.branch) this.hologram = new RouteHologram(!!this.gameplay.world?.continuous,
        this.facility ? descentRouteSwatches : undefined);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  prepare(renderer: THREE.WebGLRenderer) {
    if (!this.volume) {
      renderer.compile(this.scene, this.camera);
      return;
    }
    const gate = new GateVisual(this.gateGeometries, this.volume.obstacle, 0, 0);
    const sample = this.tunnel?.surfaceMaterials;
    const plane = sample && new THREE.PlaneGeometry(1, 1);
    const previews = plane && sample ? sample.map(material => new THREE.Mesh(plane, material)) : [];
    this.scene.add(gate.meshes[0]);
    for (const preview of previews) this.scene.add(preview);
    try {
      this.tunnel?.surfaces?.upload(renderer);
      if (this.tunnel && this.gameplay?.branch && !this.facility && !this.disposeJunctionPrograms) {
        this.disposeJunctionPrograms = prepareJunctionPrograms(renderer, this.scene, this.camera);
      } else {
        renderer.compile(this.scene, this.camera);
      }
      this.hologram?.prepare(renderer);
      // Keep the shared shader program alive through the first real gate.
      this.preparedGate?.dispose();
      this.preparedGate = gate;
    } finally {
      this.scene.remove(gate.meshes[0]);
      for (const preview of previews) this.scene.remove(preview);
      plane?.dispose();
      if (this.preparedGate !== gate) gate.dispose();
    }
  }

  private preparedGate?: GateVisual;

  updateOrbit(view: OrbitView, height: number, dpr: number, quality: QualityTier) {
    this.moveCamera(this.path.sample(view.station, this.cameraFrame), view.x, view.y);
    this.setFov(BASE_FOV);
    this.orbit?.update(this.camera, height, dpr, quality, 0, view.station);
  }

  updateAstralWorld(sim: SceneState, height: number, dpr: number, quality: QualityTier, lighting?: LightingPreview) {
    if (!this.orbit) return;
    const station = sim.trackDistance;
    const plan = sim.outroPlan;
    const release = plan ? Math.max(ease((station - plan.afterglowStart) / 250),
      ease((sim.beat - (this.volume!.beats - 10)) / 10) * .65) : 0;
    this.orbit.update(this.camera, height, dpr, quality, release, station);
    this.orbitGuides?.update(station, sim.time, sim.branch?.side ?? sim.routeSide, !!sim.branch?.side,
      height * this.camera.aspect, height, lighting?.reducedMotion ? 0 : lighting?.dynamics?.amount ?? 0);
  }

  private moveCamera(cameraFrame: PathFrame, x: number, y: number, width = 0) {
    const [cx, cy] = playerViewOffset(x, y, width);
    this.camera.position.copy(cameraFrame.p).addScaledVector(cameraFrame.r, cx).addScaledVector(cameraFrame.u, cy);
    this.basis.makeBasis(cameraFrame.r, cameraFrame.u, this.backwards.copy(cameraFrame.f).negate());
    this.camera.quaternion.setFromRotationMatrix(this.basis);
  }

  update(sim: SceneState, deterministic: boolean, lighting?: LightingPreview) {
    if (!this.volume) return { focus: null, locked: false };
    const { x, y, roll } = sim.camera;
    const distance = lighting?.station ?? sim.trackDistance;
    const dynamics = lighting?.dynamics ?? steadyLights;
    const lightBeat = lighting?.beat ?? sim.beat;
    this.updateJunction(sim);
    const plan = sim.outroPlan && distance + 650 >= sim.outroPlan.afterglowStart ? sim.outroPlan : undefined;
    if (this.outro !== plan) {
      this.outro = plan;
      if (this.scenic) {
        const atlas = plan ? makeAfterglowAtlas(plan) : [];
        this.tunnel?.setAfterglow(atlas);
        this.scenic.setAfterglow(atlas);
      }
      if (this.facility) this.tunnel?.setFacilityOutro(plan);
    }
    this.tunnel?.update(distance, sim.phase === 'menu', this.junction?.path, sim.branch?.side ?? undefined);
    if (this.facility && this.facilityBackground) {
      const beat = sim.phase === 'menu' ? 0 : lighting?.rhythmBeat ?? lightBeat;
      this.fog.density = this.facility.light(distance, beat, dynamics, this.fog.color, this.facilityBackground,
        lighting?.descentFocus, lighting?.reducedMotion);
    }
    const junction = this.junction;
    if (this.scenic && this.tunnel) {
      const state = this.scenic.update(distance, lightBeat, lighting?.pattern, sim.phase !== 'menu', dynamics.fixtureGain);
      const { base, sky, ground } = this.scenic;
      this.hue = state.hue;
      this.saturation = state.saturation;
      this.tunnel.setScenic(base, sky, ground, state, dynamics);
      this.fog.color.copy(this.scenic.fog);
      if (junction instanceof BranchVisual) {
        junction.updateLighting(state.beat, state.branch, dynamics.rimGain);
        if (sim.route && distance >= junction.path.split && distance < junction.path.end) {
          const { hue, saturation } = junction.tones[sim.route];
          const envelope = ease((distance - junction.path.split) / 14) * ease((junction.path.end - distance) / 14);
          this.fog.color.lerp(this.routeFog.setHSL(hue, saturation * .65, .105).multiplyScalar(.041), .48 * envelope);
        }
      }
    } else if (junction instanceof BranchVisual) junction.updateLighting(lightBeat, 1, dynamics.rimGain);
    const activePath = this.orbit ? sim.junctionPath : junction?.path;
    const cameraFrame = activePath && sim.branch?.side
      ? activePath.sample(distance, sim.branch.side, this.cameraFrame)
      : this.path.sample(distance, this.cameraFrame);
    const width = sim.steeringWidth;
    this.moveCamera(cameraFrame, x, y, width);
    if (lighting?.cameraLift) this.camera.position.y += lighting.cameraLift;
    this.camera.rotateZ(roll);
    if (lighting?.yaw) this.camera.rotateY(lighting.yaw);
    if (lighting?.pitch) this.camera.rotateX(lighting.pitch);
    const previousPhase = this.phase;
    this.phase = sim.phase;
    let daylight = 0;
    let junctionFill = 0;
    if (this.exterior) {
      const release = sim.outroPlan ? ease((distance - sim.outroPlan.afterglowStart) / 330) : 0;
      const white = sim.escapeWhite ?? 0;
      const settling = sim.phase === 'results' || (sim.phase === 'crash' && white > 0);
      const escaped = settling && distance > (sim.outroPlan?.mainLastStation ?? Infinity);
      const resultsLight = escaped ? .15 * ease((sim.time - this.volume.beats * 60 / this.volume.bpm) / .3) : 0;
      daylight = Math.max(release * .36, white, resultsLight);
      const brightness = this.exterior.update(sim.beat, sim.phase === 'menu', daylight);
      if (junction) junctionFill = ease((distance - junction.path.start) / 24) * ease((junction.path.end - distance) / 24);
      this.tunnel?.setDaylight(brightness, this.exterior.air, this.exterior.sunlight, daylight, junctionFill);
      this.fog.color.copy(this.exterior.air).multiplyScalar(.82).lerp(this.daylightFog, daylight * .48);
    }

    const mainPreviews = activePath && sim.routeGuide && sim.branch && !sim.branch.side && sim.branchGates
      ? [...sim.previewGates, ...[sim.branchGates.main[0], sim.branchGates.challenge[0], sim.branchGates.score[0]].filter(Boolean)]
      : sim.previewGates;
    const previews: readonly SceneGate[] = sim.previewEncore.length ? [...mainPreviews, ...sim.previewEncore] : mainPreviews;
    for (const [gate, visual] of this.visuals) {
      if (previews.includes(gate)) continue;
      this.scene.remove(...visual.meshes);
      visual.dispose();
      this.visuals.delete(gate);
    }
    this.updatePickup(sim);

    if (sim.phase === 'playing') {
      const lensPulse = this.volume.id !== 'daybreak' && !this.orbit && sim.mode === 'standard'
        ? (0.5 + 0.5 * Math.cos(sim.beat * Math.PI * 2)) ** 2 * 0.65 : 0;
      this.setFov(BASE_FOV + lensPulse + sim.boostLens * 7 + Math.min(sim.speed, 56) * 0.045 + width);
    }
    if (sim.phase === 'menu') {
      this.setFov(BASE_FOV);
      if (!this.scenic && !this.facility) this.tunnel?.pulse(this.volume.id === 'daybreak' ? 0 : (1 - ((sim.beat * 0.5) % 1)) ** 3 * 0.15, dynamics);
      return { focus: null, locked: false };
    }
    if (sim.phase === 'results' || (sim.phase === 'crash' && previousPhase === 'crash')) {
      return { focus: null, locked: false };
    }

    const pulse = (1 - lightBeat % 1) ** 4;
    if (this.orbit) {
      const phase = Math.max(0, Math.min(this.volume.hue.length - 1, lightBeat / this.volume.beats * (this.volume.hue.length - 1)));
      const index = Math.floor(phase);
      this.hue = THREE.MathUtils.lerp(this.volume.hue[index], this.volume.hue[Math.min(index + 1, this.volume.hue.length - 1)], phase - index);
      this.saturation = .82;
    } else if (this.tunnel && !this.scenic && !this.facility && (sim.phase === 'playing' || sim.phase === 'crash')) {
      const phase = lightBeat / 32;
      const index = Math.floor(phase);
      const hue = this.volume.hue;
      this.hue = THREE.MathUtils.lerp(hue[index % hue.length], hue[(index + 1) % hue.length],
        THREE.MathUtils.smoothstep(phase - index, 0.78, 1));
      this.tunnel.setHue((this.hue + 1) % 1);
      this.tunnel.pulse(this.volume.id === 'daybreak' ? 0 : pulse * (sim.phase === 'playing' ? 0.55 : 0.18), dynamics);
      if (junction instanceof BranchVisual && junctionFill > 0) {
        this.tunnel.tintJunctionLights(junctionFill, sim.route ? junction.tones[sim.route] : undefined);
      }
      if (!this.exterior) this.fog.color.setHSL((this.hue + 1) % 1, 0.75, 0.030);
    }

    let focus = 46;
    let aimed: SceneGate | undefined;
    const scale = modeScale(sim.mode);
    const microContrast = this.volume.id === 'elsewhere' || this.volume.id === 'daybreak' || this.orbit ? glassMicroContrast(sim.speed) : 1;
    for (const gate of previews) {
      const route = 'index' in gate ? undefined : gate.route;
      let visual = this.visuals.get(gate);
      if (!visual) {
        visual = new GateVisual(this.gateGeometries, gate.kind, gate.open, gate.axis);
        const side = route === 'main' ? 'center' : sim.branch?.layout.left === route ? 'left' : 'right';
        for (const [index, mesh] of visual.meshes.entries()) {
          const station = gate.worldStation - index * THICKNESS;
          const f = route ? sim.junctionPath!.sample(station, side, this.gateFrame) : this.path.sample(station, this.gateFrame);
          mesh.position.copy(f.p);
          mesh.up.copy(f.u);
          mesh.lookAt(this.gateTarget.copy(f.p).sub(f.f));
        }
        this.visuals.set(gate, visual);
        this.scene.add(...visual.meshes);
      }
      const ahead = gate.routeStation - sim.distance;
      const tone = route ? this.orbit ? routeTone(route, lightBeat) : junction instanceof BranchVisual ? junction.tones[route] : undefined : undefined;
      const visibilityScale = this.orbit && route && !sim.route ? scale * 1.3 : scale;
      const gateTint = this.facility?.gateTint(gate.worldStation, this.gateTint);
      if (!visual.update(sim.time, tone?.hue ?? this.hue, ahead, visibilityScale,
        'hit' in gate && gate.hit, microContrast, tone?.saturation ?? this.saturation, gateTint, this.facility?.gateRim)) continue;
      if (!route || route === sim.route) {
        if (ahead > 1 && ahead < focus) focus = ahead;
        if (!aimed && ahead > 3 && ahead < 34) aimed = gate;
      }
    }
    if (!deterministic) {
      const shake = Math.max(0, 1 - (sim.time - sim.hitTime) * 2.2) ** 2;
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.9;
    }
    return { focus, locked: sim.phase === 'playing' && !!aimed
      && canPass(aimed.kind, aimed.open, aimed.axis, x, y) };
  }

  private setFov(fov: number) {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private updateJunction(sim: SceneState) {
    if (this.orbit) {
      const path = sim.junctionPath, layout = sim.branch?.layout;
      if (path && layout && (this.orbitGuides?.path !== path || this.orbitGuides.layout !== layout)) {
        this.orbitGuides?.dispose();
        this.orbitGuides = new OrbitRouteGuides(path, layout);
        this.scene.add(this.orbitGuides.mesh);
      }
      return;
    }
    if (!this.tunnel) return;
    const path = sim.junctionPath;
    const layout = sim.branch?.layout;
    const past = path && sim.trackDistance > path.end + 95;
    const visible = path && sim.trackDistance >= (this.facility ? path.start - this.camera.far : path.guideStart - 100);
    if (path && layout && (this.gameplay?.world?.continuous || (!past && visible))) {
      if (this.junction?.path === path && this.junction.layout === layout) return;
      this.junction?.dispose();
      this.junction = this.facility?.junction(path, layout) ??
        new BranchVisual(path, layout, this.tunnel.junctionShell, this.tunnel.junctionCanopy);
      this.scene.add(this.junction.group);
      this.tunnel.setJunction(this.junction.path);
    } else if (this.junction) {
      this.junction.dispose();
      this.junction = undefined;
      this.tunnel.setJunction(undefined, !!past);
    }
  }

  get junctionMeshes() { return this.junction?.group.children.length ?? 0; }
  get routeTraces() { return this.orbitGuides?.metrics(); }
  get descentLighting() { return this.facility?.lighting; }
  get continuity() { return this.gameplay?.world?.continuous ? this.tunnel?.continuity : undefined; }
  get skyDaylight() { return this.exterior?.daylight; }
  get encoreMeshes() {
    let count = 0;
    for (const [gate, visual] of this.visuals) if ('index' in gate) count += visual.meshes.length;
    return count;
  }
  get routeLighting() { return this.junction instanceof BranchVisual ? { ...this.junction.tones } : undefined; }
  get junctionLightLevel() { return this.junction instanceof BranchVisual ? this.junction.lightLevel : undefined; }

  private updatePickup(sim: SceneState) {
    const spec = this.gameplay?.pickup;
    if (!spec || sim.phase !== 'playing' || !sim.pickupVisible || !sim.pickup) {
      this.pickup?.dispose();
      this.pickup = undefined;
      return;
    }
    if (!this.pickup) {
      this.pickup = new PickupVisual(sim.pickup.kind, !!this.facility);
      this.scene.add(this.pickup.group);
    }
    const { p, r, u, f } = spec.route && sim.junctionPath && sim.branch?.side
      ? sim.junctionPath.sample(sim.pickupStation, sim.branch.side, this.pickupFrame)
      : this.path.sample(sim.pickupStation, this.pickupFrame);
    const group = this.pickup.group;
    group.position.copy(p).addScaledVector(r, spec.x).addScaledVector(u, spec.y);
    this.basis.makeBasis(r, u, this.backwards.copy(f).negate());
    group.quaternion.setFromRotationMatrix(this.basis);
    this.pickup.update(sim.beat, (sim.pickupStation - sim.trackDistance) / (sim.pickupStation - sim.pickupPreviewStation));
  }

  dispose() {
    this.preparedGate?.dispose();
    this.pickup?.dispose();
    this.hologram?.dispose();
    this.junction?.dispose();
    this.disposeJunctionPrograms?.();
    for (const visual of this.visuals.values()) visual.dispose();
    this.visuals.clear();
    this.gateGeometries.dispose();
    this.tunnel?.dispose();
    this.scenic?.dispose();
    this.surfaceLibrary?.dispose();
    this.exterior?.dispose();
    this.orbit?.dispose();
    this.orbitGuides?.dispose();
    this.scene.clear();
  }
}

export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  private capabilities: ReturnType<typeof readCapabilities>;
  private volume?: VolumeScene;
  private corridor?: Path;
  private mode: PlayMode = 'standard';
  private textures?: ReturnType<typeof buildTextures>;
  private environment?: THREE.WebGLRenderTarget;
  private daylightEnvironment?: { target: THREE.WebGLRenderTarget; sun: THREE.Vector3 };
  private post?: PostFX;
  private postFailure: string | null = null;
  private quality: QualityTier;
  private dropped = false;
  private width = 1;
  private height = 1;
  private deviceDpr = 1;
  private effectiveDpr = 1;
  private mobile: boolean;
  private locked = false;

  constructor(canvas: HTMLCanvasElement, tier: QualityTier, mobile: boolean, private readonly flags: Diagnostics) {
    const gl = canvas.getContext('webgl2', {
      antialias: tier === 'high' || (tier === 'auto' && !mobile),
      // Match the context attributes Three r187 supplies in the A0 renderer.
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    if (!gl) throw new UnsupportedGraphics('This browser could not start WebGL2.');
    this.gl = gl;
    this.quality = tier;
    this.mobile = mobile;
    this.capabilities = this.readDeviceCapabilities();
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl });
    this.renderer.debug.onShaderError = (context, program, vertex, fragment) => {
      if (context.isContextLost()) return;
      const compiled = context.getShaderParameter(vertex, context.COMPILE_STATUS) &&
        context.getShaderParameter(fragment, context.COMPILE_STATUS);
      const log = context.getProgramInfoLog(program);
      throw new ShaderFailure(`WebGL shader could not ${compiled ? 'link' : 'compile'}.`, { cause: log });
    };
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setClearColor(0, 1);
    try {
      this.configure(tier, mobile);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get camera() { return this.volume?.camera; }
  get path() { return this.corridor; }

  load(definition: VolumeDefinition, existingPath?: Path, mode: PlayMode = 'standard') {
    const wasOrbit = !!this.volume?.orbit;
    this.volume?.dispose();
    this.volume = undefined;
    if (definition.id !== 'daybreak') this.releaseDaylightEnvironment();
    const path = this.corridor = existingPath ?? buildRunPath(definition, mode);
    this.mode = mode;
    this.volume = this.withCoreShaders(() => {
      const materials = definition.id === 'elsewhere' ? new MaterialLibrary()
        : definition.topology === 'facility' || definition.topology === 'orbit' ? undefined : this.textures ??= buildTextures();
      return new VolumeScene(definition, materials, sun => this.environmentFor(sun), path, mode);
    });
    this.updateExteriorDetail();
    this.sizeCamera();
    if (wasOrbit !== !!this.volume.orbit) this.configure(this.quality, this.mobile);
  }

  loadOrbit(path: Path, seed: number, density: OrbitDensity) {
    const enteringOrbit = !this.volume?.orbit;
    this.volume?.dispose();
    this.volume = undefined;
    this.corridor = path;
    this.volume = this.withCoreShaders(() => new VolumeScene(null, undefined, () => null, path, 'standard', { seed, density }));
    this.sizeCamera();
    if (enteringOrbit) this.configure(this.quality, this.mobile);
  }

  restoreOrbit(path: Path, seed: number, density: OrbitDensity, quality: QualityTier) {
    this.capabilities = this.readDeviceCapabilities();
    this.quality = quality;
    this.loadOrbit(path, seed, density);
  }

  private environmentFor(sun?: THREE.Vector3) {
    if (!this.capabilities.halfFloat) return null;
    if (!sun) {
      this.environment ??= makeEnvMap(this.renderer);
      return this.environment.texture;
    }
    if (!this.daylightEnvironment?.sun.equals(sun)) {
      this.releaseDaylightEnvironment();
      this.daylightEnvironment = { target: makeDaybreakEnvMap(this.renderer, sun), sun: sun.clone() };
    }
    return this.daylightEnvironment.target.texture;
  }

  private releaseDaylightEnvironment() {
    this.daylightEnvironment?.target.dispose();
    this.daylightEnvironment = undefined;
  }

  prepare() {
    this.withCoreShaders(() => {
      this.volume?.prepare(this.renderer);
      if (this.gl.isContextLost()) return;
      // Complete Three's first-use checks and shader deletion even for programs that never draw.
      for (const program of this.renderer.info.programs ?? []) {
        program.getUniforms();
      }
    });
  }

  configure(tier: QualityTier, mobile: boolean) {
    this.quality = tier;
    this.mobile = mobile;
    this.dropped = false;
    this.updateExteriorDetail();
    this.clearPost(null);
    this.resize(this.width, this.height, this.deviceDpr);
    this.buildPost(selectProfile(tier, mobile, this.capabilities));
  }

  resize(width: number, height: number, deviceDpr: number) {
    if (this.gl.isContextLost()) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.deviceDpr = deviceDpr;
    const profile = selectProfile(this.quality, this.mobile, this.capabilities);
    this.effectiveDpr = Math.min(deviceDpr, this.dropped ? 1 : profile.dpr,
      this.capabilities.maxSize / Math.max(this.width, this.height));
    if (this.renderer.getPixelRatio() !== this.effectiveDpr) this.renderer.setPixelRatio(this.effectiveDpr);
    this.renderer.setSize(this.width, this.height, false);
    this.sizeCamera();
    const post = this.post;
    if (!post) return;
    const targetWidth = Math.max(2, Math.floor(this.width * this.effectiveDpr));
    const targetHeight = Math.max(2, Math.floor(this.height * this.effectiveDpr));
    if (post.rtScene.width === targetWidth && post.rtScene.height === targetHeight) return;
    post.setSize(this.width, this.height, this.effectiveDpr);
    if (!post.hasCompleteTargets(this.gl)) {
      this.clearPost('PostFX framebuffer incomplete after resizing.');
      this.buildPost(post.quality, true);
    }
  }

  private clearPost(reason: string | null) {
    this.renderer.setRenderTarget(null);
    this.post?.dispose();
    this.post = undefined;
    this.postFailure = reason;
  }

  private buildPost(profile: QualityProfile, skipFirst = false) {
    if (!this.flags.post || this.gl.isContextLost()) return;
    if (!profile.halfFloat && !this.capabilities.rgba8) {
      this.postFailure = 'No complete color framebuffer is available.';
      return;
    }
    const orbit = !!this.volume?.orbit;
    if (orbit) profile = { ...profile, dof: false };
    const candidates = [profile];
    if (profile.samples) candidates.push({ ...profile, samples: 0 });
    if (profile.halfFloat && this.capabilities.rgba8) {
      candidates.push({ ...profile, halfFloat: false, dof: false, samples: 0 });
    }
    for (const candidate of candidates.slice(skipFirst ? 1 : 0)) {
      const post = new PostFX(this.renderer, candidate);
      try {
        post.setSize(this.width, this.height, this.effectiveDpr);
        if (!post.hasCompleteTargets(this.gl)) {
          this.postFailure = 'PostFX framebuffer incomplete.';
          continue;
        }
        const dof = this.flags.dof;
        if (dof) {
          post.dofMat.uniforms.uAperture.value = dof[0];
          if (dof[1] !== undefined) post.dofMat.uniforms.uMaxBlur.value = dof[1];
        }
        if (orbit) post.setAstralLook();
        this.post = post;
        return;
      } finally {
        if (this.post !== post) post.dispose();
      }
    }
  }

  private withCoreShaders<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      if (error instanceof ShaderFailure) throw new UnsupportedGraphics(error.message, { cause: error });
      throw error;
    }
  }

  private sizeCamera() {
    if (!this.camera) return;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.volume?.hologram?.resize(this.camera.aspect);
  }

  private readDeviceCapabilities() {
    const capabilities = readCapabilities(this.gl);
    if (capabilities.maxTextureSize < 1024 || capabilities.maxSize < 2) {
      throw new UnsupportedGraphics('WebGL2 limits are too low for the procedural scene.');
    }
    return capabilities;
  }

  reduceResolution() {
    if (this.effectiveDpr <= 1) return;
    this.dropped = true;
    this.updateExteriorDetail();
    this.resize(this.width, this.height, this.deviceDpr);
  }

  private updateExteriorDetail() {
    this.volume?.exterior?.setDetail(this.quality === 'low' || this.dropped ? 0 : this.quality === 'high' ? 1 : .55);
  }

  setCirrusLayer(layer: CirrusLayer) { this.volume?.exterior?.setCirrusLayer(layer); }

  releaseSurface() {
    this.volume?.dispose();
    this.volume = undefined;
    this.environment?.dispose();
    this.environment = undefined;
    this.releaseDaylightEnvironment();
    if (this.textures) for (const texture of Object.values(this.textures)) texture.dispose();
    this.textures = undefined;
    this.post?.dispose();
    this.post = undefined;
  }

  restore(volume: VolumeDefinition) {
    this.capabilities = this.readDeviceCapabilities();
    this.configure(this.quality, this.mobile);
    this.load(volume, this.corridor, this.mode);
    this.prepare();
  }

  warmSurface(sim: Simulation, deterministic: boolean, lighting?: LightingPreview) {
    this.draw(sim, deterministic, true, lighting);
    // Finish the first uploads and post passes before the transport is re-anchored.
    this.gl.finish();
  }

  update(sim: SceneState, deterministic: boolean, lighting?: LightingPreview) {
    if (!this.volume || this.gl.isContextLost()) return;
    const { locked, focus } = this.volume.update(sim, deterministic, lighting);
    this.locked = locked;
    if (focus !== null) {
      this.post?.setFocus(THREE.MathUtils.clamp(focus * 1.05, 26, 130));
      this.post?.setBoost(sim.boosting ? 1 : 0);
    }
  }

  draw(sim: SceneState, deterministic: boolean, updateScene = true, lighting?: LightingPreview) {
    if (!this.volume || this.gl.isContextLost()) return false;
    if (updateScene) this.update(sim, deterministic, lighting);
    this.volume.updateAstralWorld(sim, this.height * this.effectiveDpr, this.effectiveDpr, this.quality, lighting);
    this.render(this.volume, sim.time, sim.phase === 'playing');
    this.volume.hologram?.render(this.renderer, sim.routeGuide, sim.routeSide, !!sim.route, sim.time);
    return this.locked;
  }

  drawOrbit(view: OrbitView) {
    if (!this.volume?.orbit || this.gl.isContextLost()) return;
    this.volume.updateOrbit(view, this.height * this.effectiveDpr, this.effectiveDpr, this.quality);
    this.render(this.volume, view.time, false);
  }

  private render({ scene, camera }: VolumeScene, time: number, playing: boolean) {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.post) {
      try {
        this.post.render(scene, camera, time, playing);
      } catch (error) {
        if (!(error instanceof ShaderFailure)) throw error;
        this.clearPost(error.message);
        this.renderer.resetState();
        this.renderer.info.reset();
      }
    }
    if (!this.post) {
      this.renderer.setRenderTarget(null);
      this.withCoreShaders(() => this.renderer.render(scene, camera));
    }
  }

  metrics() {
    const { render, memory, programs } = this.renderer.info;
    const targets = this.post ? [this.post.rtScene, this.post.rtDof, this.post.rtDepth, this.post.rtA, this.post.rtB] : [];
    return {
      calls: render.calls, triangles: render.triangles,
      geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0,
      chunks: this.volume?.tunnel?.chunks.length ?? 0, dpr: this.effectiveDpr,
      orbit: this.volume?.orbit?.metrics(),
      fov: this.camera?.fov,
      routeTraces: this.volume?.routeTraces,
      gateGeometryCache: this.volume?.gateGeometryCache ?? 0,
      junctionMeshes: this.volume?.junctionMeshes ?? 0,
      descentLighting: this.volume?.descentLighting,
      continuity: this.volume?.continuity,
      skyDaylight: this.volume?.skyDaylight,
      exterior: this.volume?.exterior?.info,
      encoreMeshes: this.volume?.encoreMeshes ?? 0,
      routeLighting: this.volume?.routeLighting,
      junctionLightLevel: this.volume?.junctionLightLevel,
      routeHologram: this.volume?.hologram?.visibleLabels,
      scenicLights: this.volume?.scenic && this.volume.tunnel ? { physical: this.volume.tunnel.physicalLights, point: this.volume.tunnel.pointLights,
        active: this.volume.tunnel.activePhysicalLights,
        fixtures: this.volume.scenic.count, groups: this.volume.scenic.groups,
        batches: this.volume.scenic.batches, reduced: this.volume.scenic.reduced,
        zone: this.volume.scenic.zone, hue: this.volume.scenic.hue, afterglow: this.volume.scenic.afterglow,
        ...this.volume.tunnel.scenicTone } : undefined,
      canvas: [this.renderer.domElement.width, this.renderer.domElement.height],
      targets: targets.map(rt => [rt.width, rt.height, rt.samples]),
      dof: this.post?.quality.dof ?? false,
      colorTarget: this.post ? (this.post.quality.halfFloat ? 'rgba16f' : 'rgba8') : null,
      postFailure: this.postFailure,
      capabilities: this.capabilities,
    };
  }

  dispose() {
    this.releaseSurface();
    this.corridor = undefined;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
