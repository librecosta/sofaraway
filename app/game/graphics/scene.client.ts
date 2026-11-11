import * as THREE from 'three';
import { branchDistance, REJOIN_BEAT } from '../core/branches';
import { canPass, clampSection } from '../core/collision';
import { PICKUP_BEAT, PICKUP_LOCAL_X, PICKUP_LOCAL_Y, PICKUP_PREVIEW_BEATS } from '../core/pickups';
import { corridorLength } from '../core/simulation';
import type { RunGate, Simulation } from '../core/simulation';
import type { VolumeDefinition } from '../core/volumes';
import type { Diagnostics, QualityTier } from '../contracts';
import { BranchVisual, prepareJunctionPrograms } from './branch.client';
import { BranchPath } from './branch-path';
import { makeEnvMap, makeSky } from './environment.client';
import { GateGeometries, GateVisual, THICKNESS } from './gates.client';
import { buildPath } from './path';
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

export class UnsupportedGraphics extends Error {}

class ShaderFailure extends Error {}

class VolumeScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(76, 1, 0.1, 420);
  readonly tunnel: Tunnel;
  readonly path: ReturnType<typeof buildPath>;
  readonly hologram?: RouteHologram;
  private readonly fog = new THREE.FogExp2(0, 0.0062);
  private readonly gateGeometries = new GateGeometries();
  private readonly visuals = new Map<RunGate, GateVisual>();
  private sky?: THREE.CanvasTexture | null;
  private readonly cameraFrame = frame();
  private readonly gateFrame = frame();
  private readonly pickupFrame = frame();
  private readonly backwards = new THREE.Vector3();
  private readonly gateTarget = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private hue: number;
  private phase?: Simulation['phase'];
  private pickup?: PickupVisual;
  private junction?: BranchVisual;
  private disposeJunctionPrograms?: () => void;

  constructor(private readonly volume: VolumeDefinition, textures: ReturnType<typeof buildTextures>,
    environment: THREE.Texture | null) {
    this.hue = volume.hue[0];
    this.scene.fog = this.fog;
    try {
      this.path = buildPath(corridorLength(volume), 150, 46, volume.topology);
      this.tunnel = new Tunnel(textures, this.path, volume.topology);
      this.scene.add(this.tunnel.group);
      this.sky = makeSky(volume);
      this.scene.background = this.sky;
      this.scene.environment = environment;
      if (volume.id === 'elsewhere') this.hologram = new RouteHologram();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  prepare(renderer: THREE.WebGLRenderer) {
    const gate = new GateVisual(this.gateGeometries, this.volume.obstacle, 0, 0);
    this.scene.add(gate.meshes[0]);
    try {
      if (this.volume.id === 'elsewhere' && !this.disposeJunctionPrograms) {
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
      if (this.preparedGate !== gate) gate.dispose();
    }
  }

  private preparedGate?: GateVisual;

  update(sim: Simulation, deterministic: boolean) {
    const { x, y, roll } = sim.camera;
    const distance = sim.trackDistance;
    this.updateJunction(sim);
    this.tunnel.update(distance, sim.phase === 'menu');
    const junction = this.junction;
    const cameraFrame = junction && sim.branch?.side
      ? junction.path.sample(distance, sim.branch.side, this.cameraFrame)
      : this.path.sample(distance, this.cameraFrame);
    const width = sim.steeringWidth;
    const [cx, cy] = clampSection(x * 0.88, y * 0.88, 0.62, width);
    this.camera.position.copy(cameraFrame.p).addScaledVector(cameraFrame.r, cx).addScaledVector(cameraFrame.u, cy);
    this.basis.makeBasis(cameraFrame.r, cameraFrame.u, this.backwards.copy(cameraFrame.f).negate());
    this.camera.quaternion.setFromRotationMatrix(this.basis);
    this.camera.rotateZ(roll);
    const previousPhase = this.phase;
    this.phase = sim.phase;

    const previews = junction && sim.branch && !sim.branch.side && sim.branchGates
      ? [...sim.previewGates, sim.branchGates.main[0], sim.branchGates.challenge[0], sim.branchGates.score[0]]
      : sim.previewGates;
    for (const [gate, visual] of this.visuals) {
      if (previews.includes(gate)) continue;
      this.scene.remove(...visual.meshes);
      visual.dispose();
      this.visuals.delete(gate);
    }
    this.updatePickup(sim);

    if (sim.phase === 'menu') {
      this.tunnel.pulse((1 - ((sim.beat * 0.5) % 1)) ** 3 * 0.15);
      return { focus: null, locked: false };
    }
    if (sim.phase === 'results' || (sim.phase === 'crash' && previousPhase === 'crash')) {
      return { focus: null, locked: false };
    }

    const pulse = (1 - sim.beat % 1) ** 4;
    if (sim.phase === 'playing' || sim.phase === 'crash') {
      const phase = sim.beat / 32;
      const index = Math.floor(phase);
      const hue = this.volume.hue;
      this.hue = THREE.MathUtils.lerp(hue[index % hue.length], hue[(index + 1) % hue.length],
        THREE.MathUtils.smoothstep(phase - index, 0.78, 1));
      this.tunnel.setHue((this.hue + 1) % 1);
      this.tunnel.pulse(pulse * (sim.phase === 'playing' ? 0.55 : 0.18));
      this.fog.color.setHSL((this.hue + 1) % 1, 0.75, 0.030);
      if (sim.phase === 'playing' || previousPhase === 'playing') {
        this.camera.fov = 76 + pulse * 3.4
          + (sim.phase === 'playing' ? (sim.boosting ? 7 : 0) + Math.min(sim.speed, 56) * 0.045 + width : 0);
        this.camera.updateProjectionMatrix();
      }
    }

    let focus = 46;
    let aimed: RunGate | undefined;
    for (const gate of previews) {
      let visual = this.visuals.get(gate);
      if (!visual) {
        visual = new GateVisual(this.gateGeometries, gate.kind, gate.open, gate.axis);
        this.visuals.set(gate, visual);
        this.scene.add(...visual.meshes);
      }
      const beatsAway = gate.beat - sim.beat;
      const regular = sim.speed * beatsAway * sim.secondsPerBeat;
      const along = gate.route && junction ? junction.path.distanceAt(gate.beat)
        : sim.branch?.anchor ? sim.projectTrack(gate.beat) : distance + regular;
      const ahead = sim.branch?.anchor ? along - distance : regular;
      const side = gate.route && junction
        ? (gate.route === 'main' ? 'center' : junction.layout.left === gate.route ? 'left' : 'right') : null;
      if (!visual.update(sim.time, this.hue, ahead, beatsAway, gate.hit)) continue;
      for (const [index, mesh] of visual.meshes.entries()) {
        const s = along - index * THICKNESS;
        const f = side && junction ? junction.path.sample(s, side, this.gateFrame) : this.path.sample(s, this.gateFrame);
        mesh.position.copy(f.p);
        mesh.up.copy(f.u);
        mesh.lookAt(this.gateTarget.copy(f.p).sub(f.f));
      }
      if (!gate.route || gate.route === sim.route) {
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

  private updateJunction(sim: Simulation) {
    const { anchor, layout } = sim.branch ?? {};
    const past = anchor && sim.trackDistance > branchDistance(anchor, REJOIN_BEAT) + 95;
    if (anchor && layout && !past) {
      if (this.junction?.path.anchor === anchor) return;
      this.junction?.dispose();
      this.junction = new BranchVisual(new BranchPath(this.path, anchor), layout, this.tunnel.junctionShell);
      this.scene.add(this.junction.group);
      this.tunnel.setJunction(this.junction.path);
    } else if (this.junction) {
      this.junction.dispose();
      this.junction = undefined;
      this.tunnel.setJunction(undefined, !!past);
    }
  }

  get junctionMeshes() { return this.junction?.group.children.length ?? 0; }

  private updatePickup(sim: Simulation) {
    const beatsAway = PICKUP_BEAT - sim.beat;
    if (sim.phase !== 'playing' || sim.pickup?.status !== 'pending' || beatsAway > PICKUP_PREVIEW_BEATS) {
      this.pickup?.dispose();
      this.pickup = undefined;
      return;
    }
    if (!this.pickup) {
      this.pickup = new PickupVisual(sim.pickup.kind);
      this.scene.add(this.pickup.group);
    }
    const distance = sim.distance + sim.speed * beatsAway * sim.secondsPerBeat;
    const { p, r, u, f } = this.path.sample(distance, this.pickupFrame);
    const group = this.pickup.group;
    group.position.copy(p).addScaledVector(r, PICKUP_LOCAL_X).addScaledVector(u, PICKUP_LOCAL_Y);
    this.basis.makeBasis(r, u, this.backwards.copy(f).negate());
    group.quaternion.setFromRotationMatrix(this.basis);
    this.pickup.update(sim.beat, beatsAway);
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
    this.sky?.dispose();
    this.scene.clear();
  }
}

export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  private capabilities: ReturnType<typeof readCapabilities>;
  private volume?: VolumeScene;
  private textures?: ReturnType<typeof buildTextures>;
  private environment?: THREE.WebGLRenderTarget;
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

  load(definition: VolumeDefinition) {
    this.volume?.dispose();
    this.volume = undefined;
    this.volume = this.withCoreShaders(() => {
      this.textures ??= buildTextures();
      if (this.capabilities.halfFloat) this.environment ??= makeEnvMap(this.renderer);
      return new VolumeScene(definition, this.textures, this.environment?.texture ?? null);
    });
    this.sizeCamera();
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
    // ORBIT's procedural sky uses a 1024px-wide texture.
    if (capabilities.maxTextureSize < 1024 || capabilities.maxSize < 2) {
      throw new UnsupportedGraphics('WebGL2 limits are too low for the procedural scene.');
    }
    return capabilities;
  }

  reduceResolution() {
    if (this.effectiveDpr <= 1) return;
    this.dropped = true;
    this.resize(this.width, this.height, this.deviceDpr);
  }

  releaseSurface() {
    this.volume?.dispose();
    this.volume = undefined;
    this.environment?.dispose();
    this.environment = undefined;
    if (this.textures) for (const texture of Object.values(this.textures)) texture.dispose();
    this.textures = undefined;
    this.post?.dispose();
    this.post = undefined;
  }

  restore(volume: VolumeDefinition) {
    this.capabilities = this.readDeviceCapabilities();
    this.configure(this.quality, this.mobile);
    this.load(volume);
    this.prepare();
  }

  warmSurface(sim: Simulation, deterministic: boolean) {
    this.draw(sim, deterministic);
    // Finish the first uploads and post passes before the transport is re-anchored.
    this.gl.finish();
  }

  update(sim: Simulation, deterministic: boolean) {
    if (!this.volume || this.gl.isContextLost()) return;
    const { locked, focus } = this.volume.update(sim, deterministic);
    this.locked = locked;
    if (focus !== null) {
      this.post?.setFocus(THREE.MathUtils.clamp(focus * 1.05, 26, 130));
      this.post?.setBoost(sim.boosting ? 1 : 0);
    }
  }

  draw(sim: Simulation, deterministic: boolean, updateScene = true) {
    if (!this.volume || this.gl.isContextLost()) return false;
    if (updateScene) this.update(sim, deterministic);
    const { scene, camera } = this.volume;
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    if (this.post) {
      try {
        this.post.render(scene, camera, sim.time, sim.phase === 'playing');
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
    const routeGuide = sim.routeGuide;
    if (routeGuide) this.volume.hologram?.render(this.renderer, routeGuide, sim.routeSide, !!sim.route, sim.time);
    return this.locked;
  }

  metrics() {
    const { render, memory, programs } = this.renderer.info;
    const targets = this.post ? [this.post.rtScene, this.post.rtDof, this.post.rtDepth, this.post.rtA, this.post.rtB] : [];
    return {
      calls: render.calls, triangles: render.triangles,
      geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0,
      chunks: this.volume?.tunnel.chunks.length ?? 0, dpr: this.effectiveDpr,
      junctionMeshes: this.volume?.junctionMeshes ?? 0,
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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
