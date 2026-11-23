import { auroraCavity, auroraFrame } from '../core/orbit-nebula-structure';

/** Keep perspective/angular size intact; reserve the far depth band for astronomical distances. */
export const astralProjection = /* glsl */`
  float distanceZ = -mvPosition.z;
  if (distanceZ > 570.0) {
    float mappedZ = 570.0 + 100.0 * (1.0 - exp(-(distanceZ - 570.0) / 3500.0));
    gl_Position.z = (-projectionMatrix[2][2] + projectionMatrix[3][2] / mappedZ) * gl_Position.w;
  }
`;

/** Homogeneous emission/absorption segment in linear, premultiplied radiance. */
export const nebulaIntegration = /* glsl */`
vec4 nebulaSegment(vec3 emissivity,float gas,float dust,float weight) {
  float tau=max(0.0,gas+2.15*dust)*clamp(weight,0.0,1.0);
  float alpha=tau<.001?tau*(1.0-tau*.5):1.0-exp(-tau);
  float integral=tau<.001?1.0-tau*.5:alpha/max(tau,.000001);
  return vec4(max(emissivity,vec3(0))*clamp(weight,0.0,1.0)*integral,alpha);
}
`;

export const nebulaFragment = /* glsl */`
${nebulaIntegration}
uniform highp sampler2DArray structuralField;
uniform highp sampler3D flowNoise;
uniform float presence, detail, layer, seed, inspection;
uniform float choreoGain, choreoHue, choreoFiber, choreoPhase;
varying vec2 vUv;

float shape(vec2 p, vec2 center, vec2 scale) {
  vec2 d = (p - center) * scale;
  return exp(-dot(d, d));
}

void main() {
  // Every plane covers the same rectangle in the AURORA frame. Its layer
  // selects the density at the plane's own physical distance from the anchor.
  vec2 p = (vUv * 2.0 - 1.0) * vec2(${auroraFrame.xExtent}, ${auroraFrame.yExtent});
  vec3 noisePos = vec3(p * .27, layer * .13 + seed);
  vec4 drift = texture(flowNoise, noisePos);
  vec2 offset = inspection < .5 ? (drift.gb - .5) * vec2(.023, .058) : vec2(0.0);
  vec4 field = texture(structuralField, vec3(vUv + offset, layer));
  float rawGas = field.r + field.g;
  float wall = smoothstep(.018, .23, field.b);
  vec2 cavity = vec2(${auroraCavity.x}, ${auroraCavity.y});
  float litWall = wall * smoothstep(-.60, .52, p.y - cavity.y + .32 * (p.x - cavity.x));
  float nursery = shape(p, vec2(1.02,.85), vec2(2.65,3.8)) * smoothstep(.10,.49,rawGas);
  float edge = smoothstep(0.0,.12,vUv.x) * smoothstep(0.0,.12,1.0-vUv.x)
    * smoothstep(0.0,.12,vUv.y) * smoothstep(0.0,.12,1.0-vUv.y);
  float pathWeight = edge * presence * .53;

  if (inspection > .5) {
    float visible = rawGas;
    if (inspection < 1.5) visible = field.r;
    else if (inspection < 2.5) visible = field.g;
    else if (inspection < 3.5) visible = field.b * 2.5;
    else if (inspection < 4.5) visible = rawGas * (.75 * litWall + .95 * nursery);
    float alpha = 1.0 - exp(-1.65 * visible * pathWeight);
    gl_FragColor = vec4(vec3(.58), alpha);
  } else {
    vec2 tangent = normalize(vec2(1.0, (field.a - .5) / .23));
    vec2 flow = vec2(dot(p, tangent), dot(p, vec2(-tangent.y, tangent.x)));
    vec3 stream = vec3(flow * vec2(.20, .81) + (drift.gb - .5) * .31, noisePos.z);
    vec4 eddy = texture(flowNoise, stream);
    float wisps = smoothstep(.27, .71, eddy.g * .74 + drift.g * .26);
    float fiber = .42;
    if (detail > 2.5) {
      // Prefilter the advected filament domain before sharpening its ridges.
      vec3 fine = stream * vec3(1.75, 3.6, 1.0) + vec3(eddy.b * .23, eddy.g * .32, .37);
      float footprint = max(length(dFdx(fine)), length(dFdy(fine)));
      float resolved = 1.0 - smoothstep(.025, .12, footprint);
      vec4 filament = texture(flowNoise, fine);
      float ridge = smoothstep(.48, .69, filament.g);
      if (detail > 3.5) {
        vec3 split = fine * vec3(1.53, 1.83, 1.0) + vec3(filament.b * .19, filament.g * .27, .24);
        float splitFootprint = max(length(dFdx(split)), length(dFdy(split)));
        float splitResolved = 1.0 - smoothstep(.025, .11, splitFootprint);
        ridge = mix(ridge, ridge * (.57 + .90 * texture(flowNoise, split).g), splitResolved);
      }
      fiber = mix(fiber, ridge, resolved * (detail > 3.5 ? 1.0 : .68));
    }
    float gas = rawGas * (.48 + .66 * wisps + .31 * fiber);
    float dust = field.b * (.62 + .76 * smoothstep(.34,.68,drift.b));
    float violet = smoothstep(-1.65,1.72,p.x + (eddy.b - .5) * 1.4);
    vec3 pigment = mix(vec3(.022,.094,.23), vec3(.29,.052,.21), violet);
    pigment = mix(pigment, vec3(.025,.18,.32), (1.0 - violet) * wisps * .55);
    pigment = mix(pigment, vec3(.24,.42,.56), litWall * (.26 + .58 * wisps));
    pigment = mix(pigment, vec3(.64,.30,.13), nursery * (.25 + .39 * wisps));
    float response = rawGas * (litWall * .51 + nursery * .36 + field.g * .13);
    float travel = .5 + .5 * cos(p.x * .9 + p.y * .46 - choreoPhase - layer * .46);
    float shimmer = choreoFiber * fiber * travel * (field.g + .3 * litWall);
    float exposure = 1.0 + (choreoGain - 1.0) * (.66 + .34 * litWall);
    vec3 emission = pigment * gas * (1.00 + .45 * wisps + .48 * fiber) * exp(-dust * .63);
    emission *= exposure * (1.0 + shimmer * .42);
    emission += vec3(.11,.15,.21) * response * choreoHue * travel;
    vec4 segment = nebulaSegment(emission, gas * .84, dust, pathWeight);
    gl_FragColor=vec4(segment.rgb/max(segment.a,.000001),segment.a);
  }
  #include <colorspace_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}
`;
