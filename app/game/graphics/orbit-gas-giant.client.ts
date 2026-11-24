import { astralProjection } from './orbit-cosmic-shaders';

export const aphelionShellScale = 1.024;
export const aphelionRingBounds = [1.20, 1.62] as const;

const ringProfile = /* glsl */`
float ringBand(float r, float inner, float outer, float edge) {
  return smoothstep(inner, inner + edge, r) * (1.0 - smoothstep(outer - edge, outer, r));
}
float ringDensity(float r) {
  float inner = ringBand(r, 1.22, 1.35, .027);
  float middle = ringBand(r, 1.36, 1.49, .027);
  float outer = ringBand(r, 1.51, 1.62, .031);
  float strands = ringBand(r, 1.309, 1.332, .008) + ringBand(r, 1.426, 1.455, .010)
    + ringBand(r, 1.535, 1.553, .007);
  return .19 * inner + .38 * middle + .12 * outer + .12 * strands;
}
`;

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
uniform vec3 sun, cloudSeed, ringNormal;
varying vec3 vDirection, vWorldNormal, vWorld;
${ringProfile}

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
  vec3 jet = twist(p, vec3(.23, -.27, .935), vec2(.37, .23), 3.4, major);
  jet = twist(jet, vec3(-.38, .39, .839), vec2(.20, .13), -2.7, wake);
  jet = twist(jet, vec3(.46, .79, .405), vec2(.20, .17), 2.8, polar);

  // Longitude stays implicit in the 3D field, including at both poles.
  vec2 broad = texture(cloudField, jet * .54 + cloudSeed).gb - .5;
  float lat = jet.y + broad.x * .19 + broad.y * .13;
  float gulf = belt(lat, -.34 + broad.y * .13, .24 + broad.x * .09);
  float upper = belt(lat, .20 - broad.x * .14, .29 + broad.y * .16);
  float temperate = belt(lat, .59 + broad.y * .18, .10 + broad.x * .12);
  float southern = belt(lat, -.64 + broad.x * .15, .13);
  float shear = max(max(gulf * (1.0 - gulf), upper * (1.0 - upper)),
    max(temperate * (1.0 - temperate), southern * (1.0 - southern)));
  shear = clamp(shear * 4.0, 0.0, 1.0);
  float caps = smoothstep(.64, .93, abs(p.y) + broad.x * .16);

  // Adjacent jets stretch the same cloud deck in different directions. At
  // shear boundaries and in the polar caps, weaker alignment lets it curl.
  vec3 eddy = texture(cloudField, jet * 1.38 + cloudSeed.yzx).bgr - .5;
  float winding = (.29 * gulf - .28 * upper + .23 * temperate)
    + eddy.x * mix(.10, .60, max(shear, caps));
  vec3 stream = vec3(jet.x + jet.z * winding, jet.y + eddy.y * (.026 + .069 * shear), jet.z - jet.x * winding);
  vec3 deck = stream * vec3(.80, mix(4.0, 1.48, caps), .80) + eddy * (.07 + .13 * shear);
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

  vec3 n = normalize(vWorldNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  float mu = dot(n, sun);
  float facing = clamp(dot(n, eye), 0.0, 1.0);
  // Look through a high condensate deck into the darker belts below. The
  // tangent-view column is longer and the top clouds stay lit into twilight.
  vec3 deep = mix(vec3(.043,.115,.157), vec3(.133,.105,.175), caps * .76);
  deep = mix(deep, vec3(.30,.14,.076), clamp(gulf * .58 + southern * .32 + major * .62, 0.0, 1.0));
  deep = mix(deep, vec3(.084,.21,.23), temperate * .78);
  deep *= .71 + .57 * lanes;
  vec3 upperVeil = stream * vec3(.52, mix(2.65, 1.31, caps), .52) + eddy * .19;
  float condensate = texture(cloudField, upperVeil + cloudSeed.zxy).g;
  float loft = smoothstep(.35,.76,condensate * .72 + lanes * .28 + upper * .10 + wake * .13 + polar * .08);
  float textureLight = .50 * cloud.y + .34 * filaments + .16 * (.5 + flecks);
  float cover = 1.0 - exp(-loft * (.64 + .79 * textureLight) / max(.33,facing));
  vec3 silver = mix(vec3(.29,.45,.53), vec3(.81,.68,.48), smoothstep(.05,.86,upper + loft * .42));
  silver *= .70 + .56 * textureLight;

  float ringSun = dot(sun, ringNormal);
  float ringRay = -dot(n, ringNormal) / max(.02, ringSun);
  float shadow = ringDensity(length(n + sun * max(0.0, ringRay))) * smoothstep(.03,.16,ringRay);
  float day = smoothstep(-.085, .29, mu) * (1.0 - shadow * .38);
  float highDay = smoothstep(-.19, .26, mu) * (1.0 - shadow * .27);
  float warmHorizon = smoothstep(-.20,-.02,mu) * (1.0 - smoothstep(.06,.48,mu));
  float daylight = pow(max(0.0,mu),.68);
  vec3 lowLight = deep * (.036 + day * (.22 + .81 * daylight));
  vec3 highLight = silver * (.025 + highDay * (.24 + .94 * daylight))
    * mix(vec3(1.0),vec3(1.15,.70,.51),warmHorizon * .44);
  vec3 dusk = vec3(.010,.016,.039) * (.58 + .42 * (1.0 - day));
  float haze = pow(1.0 - facing, 2.9) * mix(.11,.56,highDay);
  vec3 color = mix(lowLight, highLight, cover) + dusk;
  color = mix(color, mix(vec3(.028,.055,.139),vec3(.23,.44,.58),highDay),haze);
  gl_FragColor = vec4(color * (1.0 + (celestialGain - 1.0) * (.12 + cover * .16)), presence);
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
  float mu = dot(n, sun);
  float lit = smoothstep(-.16,.63,mu);
  float edge = smoothstep(.922,1.001,impact) * (1.0 - smoothstep(.64,1.0,altitude));
  float blue = exp(-2.85 * altitude) * (.049 + .60 * lit);
  float amber = exp(-7.8 * altitude) * smoothstep(-.23,-.02,mu) * (1.0-smoothstep(.42,.92,mu));
  float forward = .83 + .17 * pow(clamp(.5 - .5 * dot(eye,sun),0.0,1.0),3.0);
  vec3 tint = vec3(.22,.50,.82) * blue + vec3(.83,.44,.24) * amber * .26;
  gl_FragColor = vec4(tint, presence * edge * forward * (1.0 + (celestialGain - 1.0) * .36));
  #include <colorspace_fragment>
}
`;

export const aphelionRings = /* glsl */`
uniform float presence, celestialGain, planetRadius;
uniform vec3 sun, ringNormal, planetCenter;
varying vec3 vDirection, vWorld;
${ringProfile}
void main() {
  float radius = length(vDirection);
  float pixel = min(.026, max(.002, fwidth(radius)));
  float density = (ringDensity(radius - pixel) + 2.0 * ringDensity(radius) + ringDensity(radius + pixel)) * .25;
  vec3 p = (vWorld - planetCenter) / planetRadius;
  vec3 eye = normalize(cameraPosition - vWorld);
  float toward = -dot(p,eye);
  // Ray tests retain the globe's silhouette in the compressed astronomical depth band.
  float nearest = length(p + eye * max(0.0,toward));
  float visibility = smoothstep(.996,1.004,nearest);
  float night = 1.0 - smoothstep(.93,1.09,length(p + sun * max(0.0,-dot(p,sun))));
  float face = abs(dot(ringNormal,eye));
  float tau = density * .36 / max(face,.33);
  float glint = .83 + .17 * pow(max(0.0, dot(eye,sun)),2.0);
  vec3 tint = mix(vec3(.34,.42,.53),vec3(.61,.49,.34),smoothstep(1.30,1.57,radius));
  tint *= glint * (1.0 - .82 * night) * (1.0 + (celestialGain - 1.0) * .14);
  gl_FragColor = vec4(tint, (1.0 - exp(-tau)) * visibility * presence);
  #include <colorspace_fragment>
}
`;

export const aphelionMoon = /* glsl */`
uniform highp sampler3D cloudField;
uniform float presence, detail, celestialGain;
uniform vec3 sun, cloudSeed;
varying vec3 vDirection, vWorldNormal, vWorld;

float basin(vec3 p, vec3 center, float size, float irregularity) {
  float r = length(p-center) / size + irregularity * .13;
  float bowl = 1.0 - smoothstep(.61,.90,r);
  float rim = smoothstep(.78,.99,r) * (1.0-smoothstep(.99,1.21,r));
  return .32 * rim - .48 * bowl;
}
void main() {
  vec3 p = normalize(vDirection);
  vec2 continents = texture(cloudField,p * .41 + cloudSeed.yzx).gb;
  vec2 shelf = texture(cloudField,p * 1.1 + cloudSeed).bg;
  float relief = basin(p,normalize(vec3(-.33,.39,.79)),.39,shelf.x-.5)
    + basin(p,normalize(vec3(.02,-.21,.94)),.23,shelf.y-.5)
    + basin(p,normalize(vec3(-.52,-.44,.52)),.29,shelf.x-.5)
    + basin(p,normalize(vec3(.60,.42,.61)),.20,shelf.y-.5);
  vec2 gravel = texture(cloudField,p * 2.9 + cloudSeed.zxy).gb - .5;
  float grain = 0.0;
  if (detail > 2.5) grain = (texture(cloudField,p * 7.1 + cloudSeed).g - .5) * .09;
  float height = relief * .058 + (shelf.y - .5) * .013 + gravel.y * .012 + grain * .041;
  vec3 n = normalize(vWorldNormal);
  vec3 eye = normalize(cameraPosition - vWorld);
  vec3 sx = dFdx(vWorld), sy = dFdy(vWorld);
  vec3 u = cross(sy,n), v = cross(n,sx);
  float determinant = dot(sx,u);
  vec3 slope = (u * dFdx(height) + v * dFdy(height)) / max(abs(determinant),.00001);
  vec3 rock = normalize(n - slope * sign(determinant) * length(vWorldNormal));
  float mu = dot(n,sun);
  float day = smoothstep(-.09,.14,mu);
  float light = day * (.09 + pow(max(0.0,dot(rock,sun)),.73));
  vec3 terrain = mix(vec3(.047,.062,.095),vec3(.16,.18,.23),smoothstep(.23,.72,continents.x + relief * .35));
  terrain *= .76 + continents.y * .45 + gravel.x * .42 + grain;
  float rim = pow(1.0-clamp(dot(n,eye),0.0,1.0),4.6) * smoothstep(-.24,.64,mu);
  vec3 color = terrain * (.070 + 1.05 * light) + vec3(.0035,.005,.012);
  color += vec3(.043,.076,.12) * rim * (.46 + .54 * shelf.x);
  gl_FragColor=vec4(color * (1.0+(celestialGain-1.0)*.16),presence);
  #include <colorspace_fragment>
}
`;
