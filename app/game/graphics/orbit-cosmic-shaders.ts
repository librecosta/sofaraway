/** Keep perspective/angular size intact; reserve the far depth band for astronomical distances. */
export const astralProjection = /* glsl */`
  float distanceZ = -mvPosition.z;
  if (distanceZ > 570.0) {
    float mappedZ = 570.0 + 100.0 * (1.0 - exp(-(distanceZ - 570.0) / 3500.0));
    gl_Position.z = (-projectionMatrix[2][2] + projectionMatrix[3][2] / mappedZ) * gl_Position.w;
  }
`;

export const cosmicNoise = /* glsl */`
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gasNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.0),f.x),f.y);
}
float gasFbm(vec2 p, float detail) {
  float value = 0.0, weight = .53;
  for (int i=0; i<5; i++) {
    if(float(i)>detail) break;
    float footprint = max(length(dFdx(p)), length(dFdy(p)));
    value += weight * mix(.5, gasNoise(p), 1.0-smoothstep(.18,.8,footprint));
    p = mat2(1.65,1.18,-1.18,1.65)*p + 7.1; weight *= .49;
  }
  return value;
}`;

export const nebulaFragment = /* glsl */`
${cosmicNoise}
uniform float presence, detail, layer, seed;
varying vec2 vUv;
void main() {
  vec2 p = (vUv-.5)*vec2(7.5,4.5);
  vec2 warp = vec2(gasFbm(p*.7+seed,detail), gasFbm(p*.7+11.8+seed,detail));
  vec2 q = p + (warp-.48)*1.9;
  float spine = q.y + .60*sin(q.x*1.05+layer*.6) + .24*sin(q.x*2.6);
  float band = exp(-spine*spine*1.65);
  float cloud = gasFbm(q*2.1+seed,detail);
  float filaments = pow(max(0.0,1.0-abs(gasFbm(q*5.0+warp*3.0,detail)*2.0-1.0)),5.0);
  float dust = smoothstep(.43,.69,gasFbm(q*1.9+vec2(17.0,3.0),detail)+.10*sin(q.x*2.0-spine*4.0));
  float cavity = smoothstep(.1,.42, length((q-vec2(1.1,.1))*vec2(.7,1.2)));
  float density = band * smoothstep(.18,.72,cloud) * mix(.35,1.0,cavity);
  float veil = exp(-dust*3.8);
  vec3 blue = vec3(.025,.10,.32), cyan = vec3(.035,.46,.57), violet = vec3(.30,.055,.47), pink = vec3(.55,.065,.22);
  vec3 tint = mix(blue,violet,smoothstep(-2.5,1.8,q.x));
  tint = mix(tint,cyan,smoothstep(.43,.70,warp.x)*.77);
  tint = mix(tint,pink,smoothstep(.40,.7,warp.y)*.62);
  float warm = exp(-dot((q-vec2(1.3,.12))*vec2(.78,1.8),(q-vec2(1.3,.12))*vec2(.78,1.8)));
  vec3 light = tint*(.55+.95*filaments)*veil + vec3(.80,.41,.12)*warm*cloud*.52;
  light += vec3(.42,.63,.73)*pow(filaments,4.0)*warm*.12;
  float edge = smoothstep(0.0,.16,vUv.x)*smoothstep(0.0,.16,vUv.y)*smoothstep(0.0,.16,1.0-vUv.x)*smoothstep(0.0,.16,1.0-vUv.y);
  // Dust has optical density: it extinguishes the star field underneath the emitting gas.
  float alpha = clamp(density*.84 + band*dust*.56,0.0,.91)*presence*edge;
  gl_FragColor = vec4(light,alpha);
  #include <colorspace_fragment>
}`;
