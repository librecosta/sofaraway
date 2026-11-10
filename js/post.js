import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Minimal post stack: bright-pass -> separable blur -> composite
 *  (bloom, chromatic aberration, vignette, grain, scanlines, flash)
 * ------------------------------------------------------------------ */
const VS = /* glsl */`
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
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
uniform vec2 uDir;      // texel-scaled direction
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

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  // radial chromatic aberration
  vec2 off = d * r2 * uCA;
  vec3 col;
  col.r = texture2D(tScene, uv + off).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - off).b;

  vec3 bloom = texture2D(tBloom, uv).rgb;
  col += bloom * uBloom;

  col *= uExposure;

  // vignette
  float vig = smoothstep(0.95, 0.15, r2 * 1.35);
  col *= mix(1.0, vig, uVignette);

  // scanlines
  float sl = 0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159265);
  col *= 1.0 - uScan * 0.5 * sl;

  // film grain
  float g = fract(sin(dot(uv * uRes + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  // flash
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));

  // gentle filmic shoulder
  col = aces(col * 1.05);

  if (uInvert > 0.5) col = 1.0 - col;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;

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
    };

    this.rtScene = new THREE.WebGLRenderTarget(2, 2, rtOpts);
    this.rtScene.depthTexture = null;

    const bw = { ...rtOpts, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(2, 2, bw);
    this.rtB = new THREE.WebGLRenderTarget(2, 2, bw);
    this.rtC = new THREE.WebGLRenderTarget(2, 2, bw);

    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: BRIGHT,
      uniforms: { tSrc: { value: null }, uThreshold: { value: 0.78 }, uSoft: { value: 0.40 } },
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
        uBloom: { value: 1.05 },
        uCA: { value: 0.010 },
        uVignette: { value: 0.9 },
        uGrain: { value: 0.035 },
        uScan: { value: 0.10 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uExposure: { value: 1.0 },
        uInvert: { value: 0 },
      },
      depthTest: false, depthWrite: false,
    });
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.floor(w * pr));
    const H = Math.max(2, Math.floor(h * pr));
    this.rtScene.setSize(W, H);
    const bw = Math.max(2, Math.floor(W / 4));
    const bh = Math.max(2, Math.floor(H / 4));
    this.rtA.setSize(bw, bh);
    this.rtB.setSize(bw, bh);
    this.rtC.setSize(Math.max(2, W >> 1), Math.max(2, H >> 1));
    this.compMat.uniforms.uRes.value.set(W, H);
    this._W = W; this._H = H;
    this._bw = bw; this._bh = bh;
    this._hw = Math.max(2, W >> 1); this._hh = Math.max(2, H >> 1);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.renderer;

    // 1. scene
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // 2. bright pass -> quarter res
    this.brightMat.uniforms.tSrc.value = this.rtScene.texture;
    this._pass(this.brightMat, this.rtA);

    // 3. two blur iterations H/V at quarter res
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

    // 4. composite
    const u = this.compMat.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = this.rtA.texture;
    u.uTime.value = time;
    this._pass(this.compMat, null);
  }
}
