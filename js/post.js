import { QUALITY } from './quality.js?v=2026-11-10r';
import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Post: DOF -> bright pass -> separable blur -> composite
 *  (depth of field, bloom, chromatic aberration, vignette, grain,
 *   scanlines, flash, ACES shoulder)
 * ------------------------------------------------------------------ */

const VS = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* linear view-space distance, written straight into R */
const DEPTH_VS = /* glsl */`
varying float vDepth;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const DEPTH_FS = /* glsl */`
varying float vDepth;
void main(){
  gl_FragColor = vec4(vDepth, 0.0, 0.0, 1.0);
}
`;

const DOF = /* glsl */`precision highp float;
varying vec2 vUv;

uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2  uTexel;     // 1 / resolution
uniform float uNear;
uniform float uFar;
uniform float uFocus;     // world units
uniform float uAperture;  // how fast CoC grows
uniform float uMaxBlur;   // max radius, fraction of screen height

float coc(float lin){
  float rel = abs(lin - uFocus) / max(uFocus, 1.0);
  return clamp(rel * uAperture, 0.0, 1.0) * uMaxBlur;
}

void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  float d0 = texture2D(tDepth, vUv).r;
  float r0 = coc(d0);

  if (r0 < uTexel.y * 1.5) {
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  const int N = ${QUALITY.taps};
  float radius = r0;
  vec3 sum = col;
  float wsum = 1.0;

  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float ang = fi * 2.39996323;                    // golden angle
    float rad = sqrt((fi + 0.5) / float(N));
    vec2 off = vec2(cos(ang), sin(ang)) * rad * radius * vec2(uTexel.y / uTexel.x, 1.0);

    vec3 s = texture2D(tColor, vUv + off).rgb;
    float ds = texture2D(tDepth, vUv + off).r;
    float rs = coc(ds);

    // a sample contributes if its own circle reaches this pixel
    float w = smoothstep(0.0, 1.0, rs / max(r0, 1e-4));
    w = max(w, 0.12);
    sum += s * w;
    wsum += w;
  }

  gl_FragColor = vec4(sum / wsum, 1.0);
}
`;

const BRIGHT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uThreshold;
uniform float uSoft;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + uSoft, l);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

const BLUR = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
void main(){
  vec3 sum = texture2D(tSrc, vUv).rgb * 0.227027;
  sum += texture2D(tSrc, vUv + uDir * 1.384615).rgb * 0.316216;
  sum += texture2D(tSrc, vUv - uDir * 1.384615).rgb * 0.316216;
  sum += texture2D(tSrc, vUv + uDir * 3.230769).rgb * 0.070270;
  sum += texture2D(tSrc, vUv - uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE = /* glsl */`
precision highp float;
varying vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2  uRes;
uniform float uTime;
uniform float uBloom;
uniform float uCA;
uniform float uVignette;
uniform float uGrain;
uniform float uScan;
uniform float uFlash;
uniform vec3  uFlashColor;
uniform float uExposure;
uniform float uInvert;
uniform float uBoost;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  vec2 off = d * r2 * uCA;
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;

  col += texture2D(tBloom, uv).rgb * uBloom;

  // boost: radial streak toward the vanishing point, plus a hot rim
  if (uBoost > 0.01) {
    vec3 acc = col;
    for (int i = 1; i <= 4; i++) {
      vec2 o = d * (float(i) * 0.011 * uBoost);
      acc += texture2D(tScene, uv - o).rgb;
    }
    col = acc / 5.0;
    col += col * uBoost * 0.18 * smoothstep(0.02, 0.55, r2 * 2.0);
  }

  col *= uExposure;

  float vig = smoothstep(0.95, 0.15, r2 * 1.35);
  col *= mix(1.0, vig, uVignette);

  float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159265);
  col *= 1.0 - uScan * 0.5 * sl;

  float g = fract(sin(dot(uv * uRes + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  col = aces(col * 1.05);

  if (uInvert > 0.5) col = 1.0 - col;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const rtOpts = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: QUALITY.samples,
    };

    this.rtScene = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtDof = new THREE.WebGLRenderTarget(2, 2, { ...rtOpts, depthBuffer: false, samples: 0 });

    const bw = { ...rtOpts, depthBuffer: false, samples: 0 };
    this.rtA = new THREE.WebGLRenderTarget(2, 2, bw);
    this.rtB = new THREE.WebGLRenderTarget(2, 2, bw);

    // depth comes from its own packed pass — cheap geometry, and it keeps
    // MSAA on the colour target untouched
    this.rtDepth = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });

    // writes view-space distance straight into R — no packing, no decoding
    this.depthMat = new THREE.ShaderMaterial({
      vertexShader: DEPTH_VS,
      fragmentShader: DEPTH_FS,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });

    this.dofMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: DOF,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 420.0 },
        uFocus: { value: 40.0 },
        uAperture: { value: 0.30 },
        uMaxBlur: { value: 0.005 },
      },
      depthTest: false, depthWrite: false,
    });

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: BRIGHT,
      uniforms: { tSrc: { value: null }, uThreshold: { value: 0.82 }, uSoft: { value: 0.30 } },
      depthTest: false, depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: BLUR,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
    });

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: COMPOSITE,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uBloom: { value: 0.72 },
        uCA: { value: 0.008 },
        uVignette: { value: 0.92 },
        uGrain: { value: 0.030 },
        uScan: { value: 0.06 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uExposure: { value: 1.0 },
        uInvert: { value: 0 },
        uBoost: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.floor(w * pr));
    const H = Math.max(2, Math.floor(h * pr));
    this.rtScene.setSize(W, H);
    this.rtDof.setSize(W, H);
    this.rtDepth.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1));

    const bw = Math.max(2, Math.floor(W / 4));
    const bh = Math.max(2, Math.floor(H / 4));
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);

    this.compMat.uniforms.uRes.value.set(W, H);
    this.dofMat.uniforms.uTexel.value.set(1 / W, 1 / H);

    this._W = W; this._H = H;
    this._bw = bw; this._bh = bh;
  }

  /** focus is in world units; called every frame from the game loop */
  setFocus(dist) {
    const u = this.dofMat.uniforms;
    u.uFocus.value += (dist - u.uFocus.value) * 0.12;
  }

  /** 0 = cruising, 1 = boosting. Eased so it does not snap. */
  setBoost(amount) {
    const u = this.compMat.uniforms.uBoost;
    u.value += (amount - u.value) * 0.14;
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.renderer;

    // 1. depth-only pass (gates excluded: they are additive, not geometry)
    const gateVis = [];
    const hidden = [];
    scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending) {
        gateVis.push([o, o.visible]);
        o.visible = false;
      }
    });
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMat;
    r.setRenderTarget(this.rtDepth);
    r.clear();
    r.render(scene, camera);
    scene.overrideMaterial = prevOverride;
    for (const [o, v] of gateVis) o.visible = v;

    // 2. scene colour
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // 3. depth of field
    this.dofMat.uniforms.tColor.value = this.rtScene.texture;
    this.dofMat.uniforms.tDepth.value = this.rtDepth.texture;
    this.dofMat.uniforms.uNear.value = camera.near;
    this.dofMat.uniforms.uFar.value = camera.far;
    this._pass(this.dofMat, this.rtDof);

    // 4. bloom
    this.brightMat.uniforms.tSrc.value = this.rtDof.texture;
    this._pass(this.brightMat, this.rtA);

    const b = this.blurMat;
    for (let i = 0; i < 2; i++) {
      const scale = i === 0 ? 1.0 : 2.0;
      b.uniforms.tSrc.value = this.rtA.texture;
      b.uniforms.uDir.value.set(scale / this._bw, 0);
      this._pass(b, this.rtB);
      b.uniforms.tSrc.value = this.rtB.texture;
      b.uniforms.uDir.value.set(0, scale / this._bh);
      this._pass(b, this.rtA);
    }

    // 5. composite
    const u = this.compMat.uniforms;
    u.tScene.value = this.rtDof.texture;
    u.tBloom.value = this.rtA.texture;
    u.uTime.value = time;
    this._pass(this.compMat, null);
  }
}
