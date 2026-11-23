import { astralProjection } from './orbit-cosmic-shaders';

export const aphelionShellScale = 1.012;

export const aphelionVertex = /* glsl */`
varying vec3 vDirection, vWorldNormal, vWorld;
void main() {
  vDirection = position;
  // Both celestial shells are uniformly scaled spheres.
  vWorldNormal = mat3(modelMatrix) * normal;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  ${astralProjection}
}`;

export const aphelionClouds = /* glsl */`
uniform highp sampler3D cloudField;
uniform float presence, detail, celestialGain;
uniform vec3 sun, cloudSeed;
varying vec3 vDirection, vWorldNormal, vWorld;

float sharpness(vec3 point, float scale) {
  float footprint = max(length(dFdx(point)), length(dFdy(point))) * scale;
  return 1.0 - smoothstep(.35, 1.0, footprint);
}

// A compact twist in a local tangent frame, masked to the near spherical cap.
// Pulling the sampling points through the same flow bends the belts and cloud
// texture around each storm together.
vec3 twist(vec3 p, vec3 center, vec2 width, float spin, out float influence) {
  vec3 east = normalize(cross(vec3(0, 1, 0), center));
  vec3 north = cross(center, east);
  vec2 q = vec2(dot(p, east), dot(p, north)) / width;
  q.x += .24 * q.y + .16 * q.y * q.y;
  float falloff = max(0.0, 1.0 - dot(q, q));
  influence = falloff * falloff * smoothstep(.70, .95, dot(p, center));
  float angle = spin * influence;
  vec2 d = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * q - q;
  float dx = d.x - d.y * (.24 + .16 * (2.0 * q.y + d.y));
  return normalize(p + east * (dx * width.x) + north * (d.y * width.y));
}

float belt(float lat, float center, float width) {
  return 1.0 - smoothstep(width * .33, width, abs(lat - center));
}

void main() {
  vec3 p = normalize(vDirection);
  float major, wake, polar;
  vec3 jet = twist(p, vec3(.27, -.19, .944), vec2(.36, .22), 4.2, major);
  jet = twist(jet, vec3(-.36, .40, .842), vec2(.22, .15), -4.0, wake);
  jet = twist(jet, vec3(.46, .79, .405), vec2(.23, .19), 3.3, polar);

  // Longitude stays implicit in the 3D field, including at both poles.
  vec2 broad = texture(cloudField, jet * .54 + cloudSeed).gb - .5;
  float lat = jet.y + broad.x * .24 + broad.y * .19;
  float gulf = belt(lat, -.33 + broad.y * .13, .23 + broad.x * .09);
  float upper = belt(lat, .28 - broad.x * .16, .21 + broad.y * .18);
  float temperate = belt(lat, .61 + broad.y * .18, .10 + broad.x * .12);
  float southern = belt(lat, -.64 + broad.x * .15, .13);
  float shear = max(max(gulf * (1.0 - gulf), upper * (1.0 - upper)),
    max(temperate * (1.0 - temperate), southern * (1.0 - southern)));
  shear = clamp(shear * 4.0, 0.0, 1.0);
  float caps = smoothstep(.64, .93, abs(p.y) + broad.x * .16);

  // Adjacent jets stretch the same cloud deck in different directions. At
  // shear boundaries and in the polar caps, weaker alignment lets it curl.
  vec3 eddy = texture(cloudField, jet * 1.38 + cloudSeed.yzx).bgr - .5;
  float winding = (.29 * gulf - .28 * upper + .23 * temperate)
    + eddy.x * mix(.10, .91, max(shear, caps));
  vec3 stream = vec3(jet.x + jet.z * winding, jet.y + eddy.y * (.030 + .11 * shear), jet.z - jet.x * winding);
  vec3 deck = stream * vec3(.91, mix(5.1, 1.58, caps), .91) + eddy * (.075 + .20 * shear);
  vec2 cloud = mix(vec2(.5), texture(cloudField, deck + cloudSeed).gb, sharpness(deck, 8.0));
  float lanes = cloud.x * .71 + cloud.y * .29;

  float filaments = .5;
  if (detail > 2.0) {
    vec3 fiber = deck * 2.25 + vec3(lanes * .07, eddy.y * .19, cloud.y * .18);
    filaments = mix(.5, texture(cloudField, fiber + cloudSeed.zxy).g, sharpness(fiber, 8.0));
  }
  float flecks = 0.0;
  if (detail > 3.0) {
    vec3 fine = deck * 5.2 + eddy * .34;
    flecks = (texture(cloudField, fine + cloudSeed).b - .5) * sharpness(fine, 6.0);
  }

  vec3 deep = mix(vec3(.091, .151, .182), vec3(.18, .139, .181), caps * .71);
  vec3 silver = mix(vec3(.46, .53, .56), vec3(.65, .62, .54), upper);
  vec3 pigment = mix(deep, vec3(.33, .244, .161), clamp(gulf * .76 + southern * .51 + major * .29, 0.0, 1.0));
  pigment = mix(pigment, vec3(.23, .37, .36), temperate * .76);
  float lifted = smoothstep(.22, .82, lanes + (filaments - .5) * .34 + flecks * .24
    + upper * .13 - gulf * .14 + wake * .10 + polar * .06);
  vec3 clouds = mix(pigment, silver, lifted);
  clouds *= .91 + .17 * cloud.y + .11 * (filaments - .5) + .10 * flecks;

  vec3 n = normalize(vWorldNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  float mu = dot(n, sun);
  float facing = clamp(dot(n, eye), 0.0, 1.0);
  float day = smoothstep(-.15, .17, mu);
  float incident = day * (.31 + .69 * pow(max(mu, 0.0), .57));
  vec3 twilight = vec3(.022, .036, .058);
  vec3 color = clouds * (.066 + 1.26 * incident) + twilight * (.73 - .35 * day);
  // The lower deck is increasingly obscured along grazing sightlines.
  color = mix(color, mix(twilight, vec3(.15, .24, .31), day), pow(1.0 - facing, 3.2) * .38);
  gl_FragColor = vec4(color * (1.0 + (celestialGain - 1.0) * (.12 + lifted * .13)), presence);
  #include <colorspace_fragment>
}
`;

export const aphelionAtmosphere = /* glsl */`
uniform float presence, celestialGain;
uniform vec3 sun;
varying vec3 vWorldNormal, vWorld;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  float facing = clamp(dot(n, eye), 0.0, 1.0);
  float impact = (1.0 - facing * facing) * ${(aphelionShellScale ** 2).toFixed(8)};
  float altitude = clamp((impact - 1.0) / ${(aphelionShellScale ** 2 - 1).toFixed(8)}, 0.0, 1.0);
  float column = smoothstep(.935, 1.001, impact) * exp(-3.6 * altitude) * (1.0 - smoothstep(.74, 1.0, altitude));
  float mu = dot(n, sun);
  float day = smoothstep(-.19, .78, mu);
  vec3 tint = mix(vec3(.105, .185, .34), vec3(.31, .49, .62), day);
  tint = mix(tint, vec3(.48, .28, .16), (1.0 - smoothstep(.025, .19, abs(mu))) * .37);
  float light = (.10 + .90 * day) * (1.0 + (celestialGain - 1.0) * .32);
  gl_FragColor = vec4(tint, presence * column * light * .31);
  #include <colorspace_fragment>
}
`;
