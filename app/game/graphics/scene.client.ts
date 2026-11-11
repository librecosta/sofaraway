import * as THREE from 'three';
import { canPass, clampSection, WALL } from '../core/collision';
import { corridorLength } from '../core/simulation';
import type { RunGate, Simulation } from '../core/simulation';
import type { VolumeDefinition } from '../core/volumes';
import type { Diagnostics, QualityTier } from '../contracts';
import { makeEnvMap, makeSky } from './environment.client';
import { GateVisual, THICKNESS } from './gates.client';
import { buildPath } from './path';
import { PostFX } from './post.client';
import { readCapabilities, selectProfile } from './quality';
import { buildTextures } from './textures.client';
import { Tunnel } from './tunnel.client';

const frame = () => ({
  p: new THREE.Vector3(), f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(),
});

export class UnsupportedGraphics extends Error {}

class VolumeScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(76, 1, 0.1, 420);
  readonly tunnel: Tunnel;
  readonly path: ReturnType<typeof buildPath>;
  private readonly fog = new THREE.FogExp2(0, 0.0062);
  private readonly geometry = new THREE.PlaneGeometry(WALL.w, WALL.h);
  private readonly visuals = new Map<RunGate, GateVisual>();
  private textures?: ReturnType<typeof buildTextures>;
  private sky?: THREE.CanvasTexture | null;
  private environment?: THREE.WebGLRenderTarget;
  private readonly cameraFrame = frame();
  private readonly gateFrame = frame();
  private readonly backwards = new THREE.Vector3();
  private readonly gateTarget = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private hue: number;
  private phase?: Simulation['phase'];

  constructor(private readonly volume: VolumeDefinition, renderer: THREE.WebGLRenderer, halfFloat: boolean) {
    this.hue = volume.hue[0];
    this.scene.fog = this.fog;
    try {
      this.path = buildPath(corridorLength(volume), 150, 46, volume.topology);
      this.textures = buildTextures();
      this.tunnel = new Tunnel(this.textures, this.path, volume.topology);
      this.scene.add(this.tunnel.group);
      this.sky = makeSky(volume);
      this.scene.background = this.sky;
      this.restoreEnvironment(renderer, halfFloat);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  restoreEnvironment(renderer: THREE.WebGLRenderer, halfFloat: boolean) {
    this.environment?.dispose();
    this.environment = halfFloat ? makeEnvMap(renderer) : undefined;
    this.scene.environment = this.environment?.texture ?? null;
  }

  prepare(renderer: THREE.WebGLRenderer) {
    const gate = new GateVisual(this.geometry, this.volume.obstacle, 0, 0);
    this.scene.add(gate.meshes[0]);
    try {
      renderer.compile(this.scene, this.camera);
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
    const cameraFrame = this.path.sample(sim.distance, this.cameraFrame);
    const [cx, cy] = clampSection(x * 0.88, y * 0.88, 0.62);
    this.camera.position.copy(cameraFrame.p).addScaledVector(cameraFrame.r, cx).addScaledVector(cameraFrame.u, cy);
    this.basis.makeBasis(cameraFrame.r, cameraFrame.u, this.backwards.copy(cameraFrame.f).negate());
    this.camera.quaternion.setFromRotationMatrix(this.basis);
    this.camera.rotateZ(roll);
    this.tunnel.update(sim.distance);
    const previousPhase = this.phase;
    this.phase = sim.phase;

    for (const [gate, visual] of this.visuals) {
      if (sim.visibleGates.includes(gate)) continue;
      this.scene.remove(...visual.meshes);
      visual.dispose();
      this.visuals.delete(gate);
    }

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
          + (sim.phase === 'playing' ? (sim.boosting ? 7 : 0) + Math.min(sim.speed, 56) * 0.045 : 0);
        this.camera.updateProjectionMatrix();
      }
    }

    let focus = 46;
    let aimed: RunGate | undefined;
    for (const gate of sim.visibleGates) {
      let visual = this.visuals.get(gate);
      if (!visual) {
        visual = new GateVisual(this.geometry, this.volume.obstacle, gate.open, gate.axis);
        this.visuals.set(gate, visual);
        this.scene.add(...visual.meshes);
      }
      const distance = sim.speed * (gate.beat - sim.beat) * sim.secondsPerBeat;
      for (const [index, mesh] of visual.meshes.entries()) {
        const f = this.path.sample(sim.distance + distance - index * THICKNESS, this.gateFrame);
        mesh.position.copy(f.p);
        mesh.up.copy(f.u);
        mesh.lookAt(this.gateTarget.copy(f.p).sub(f.f));
      }
      visual.update(sim.time, this.hue, distance, gate.hit);
      if (distance > 1 && distance < focus) focus = distance;
      if (!aimed && distance > 3 && distance < 34) aimed = gate;
    }
    if (!deterministic) {
      const shake = Math.max(0, 1 - (sim.time - sim.hitTime) * 2.2) ** 2;
      this.camera.position.x += (Math.random() - 0.5) * shake * 0.9;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.9;
    }
    return { focus, locked: sim.phase === 'playing' && !!aimed
      && canPass(this.volume.obstacle, aimed.open, aimed.axis, x, y) };
  }

  dispose() {
    this.preparedGate?.dispose();
    for (const visual of this.visuals.values()) visual.dispose();
    this.visuals.clear();
    this.geometry.dispose();
    this.tunnel?.dispose();
    this.sky?.dispose();
    this.environment?.dispose();
    for (const texture of Object.values(this.textures ?? {})) texture.dispose();
    this.scene.clear();
  }
}

export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  private capabilities: ReturnType<typeof readCapabilities>;
  private volume?: VolumeScene;
  private post?: PostFX;
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
    this.capabilities = readCapabilities(gl);
    THREE.ColorManagement.enabled = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, context: gl });
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
    this.volume = new VolumeScene(definition, this.renderer, this.capabilities.halfFloat);
    this.sizeCamera();
  }

  prepare() { this.volume?.prepare(this.renderer); }

  configure(tier: QualityTier, mobile: boolean) {
    this.quality = tier;
    this.mobile = mobile;
    this.dropped = false;
    this.post?.dispose();
    this.post = this.flags.post ? new PostFX(this.renderer, selectProfile(tier, mobile, this.capabilities)) : undefined;
    if (this.post && this.flags.dof) {
      this.post.dofMat.uniforms.uAperture.value = this.flags.dof[0];
      if (this.flags.dof[1] !== undefined) this.post.dofMat.uniforms.uMaxBlur.value = this.flags.dof[1];
    }
    this.resize(this.width, this.height, this.deviceDpr);
  }

  resize(width: number, height: number, deviceDpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.deviceDpr = deviceDpr;
    const profile = selectProfile(this.quality, this.mobile, this.capabilities);
    this.effectiveDpr = Math.min(deviceDpr, this.dropped ? 1 : profile.dpr,
      this.capabilities.maxSize / Math.max(this.width, this.height));
    if (this.renderer.getPixelRatio() !== this.effectiveDpr) this.renderer.setPixelRatio(this.effectiveDpr);
    this.renderer.setSize(this.width, this.height, false);
    this.sizeCamera();
    this.post?.setSize(this.width, this.height, this.effectiveDpr);
  }

  private sizeCamera() {
    if (!this.camera) return;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  reduceResolution() {
    if (this.effectiveDpr <= 1) return;
    this.dropped = true;
    this.resize(this.width, this.height, this.deviceDpr);
  }

  restore() {
    this.capabilities = readCapabilities(this.gl);
    this.configure(this.quality, this.mobile);
    this.volume?.restoreEnvironment(this.renderer, this.capabilities.halfFloat);
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
      this.post.render(scene, camera, sim.time);
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
    }
    return this.locked;
  }

  metrics() {
    const { render, memory, programs } = this.renderer.info;
    const targets = this.post ? [this.post.rtScene, this.post.rtDof, this.post.rtDepth, this.post.rtA, this.post.rtB] : [];
    return {
      calls: render.calls, triangles: render.triangles,
      geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0,
      chunks: this.volume?.tunnel.chunks.length ?? 0, dpr: this.effectiveDpr,
      canvas: [this.renderer.domElement.width, this.renderer.domElement.height],
      targets: targets.map(rt => [rt.width, rt.height, rt.samples]),
      dof: this.post?.quality.dof ?? false,
    };
  }

  dispose() {
    this.volume?.dispose();
    this.volume = undefined;
    this.post?.dispose();
    this.post = undefined;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
