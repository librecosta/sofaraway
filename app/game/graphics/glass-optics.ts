import { DIAMOND_EXTENT, HUB_R, SECTION, SQUARE_HALF } from '../core/collision';

export const GLASS_VERT = /* glsl */`
attribute float aWall;
varying vec2 vLocal;
varying float vDepth;
varying float vWall;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vLocal = position.xy;
  vDepth = -mv.z;
  vWall = aWall;
  gl_Position = projectionMatrix * mv;
}
`;

export const GLASS_FRAG = /* glsl */`
precision highp float;
varying vec2 vLocal;
varying float vDepth;
varying float vWall;
uniform vec3 uColor;
uniform float uTime;
uniform float uHit;
uniform float uFade;
uniform float uStyle; // 0: Iris, 1: Square, 2: Diamond
uniform float uOpen;

const float A = ${SECTION.a};
const float B = ${SECTION.b};
const float CHAMFER = ${SECTION.ch.toFixed(2)};
const float HUB = ${HUB_R};
const float STEP = ${Math.PI / 4};
const float WEDGE = ${Math.PI / 8};
const float TAU = ${Math.PI * 2};
const float INV_SQRT2 = ${Math.SQRT1_2};

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 d = b - a;
  return length(p - a - d * clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0));
}

float boxSdf(vec2 p, float halfSize) {
  vec2 d = abs(p) - halfSize;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float hullDistance(vec2 p) {
  vec2 q = abs(p);
  vec2 shoulder = vec2(A, B - CHAMFER);
  vec2 crown = vec2(A - CHAMFER, B);
  return min(segmentDistance(q, shoulder, crown), min(
    segmentDistance(q, vec2(A, 0.0), shoulder), segmentDistance(q, crown, vec2(0.0, B))));
}

vec2 direction(float angle) { return vec2(cos(angle), sin(angle)); }

float radialEdge(vec2 p, vec2 ray) {
  vec2 q = abs(ray);
  float end = min(min(A / max(q.x, 1e-6), B / max(q.y, 1e-6)), (A + B - CHAMFER) / (q.x + q.y));
  return segmentDistance(p, ray * HUB, ray * end);
}

// Convolve with a Gaussian approximation of the pixel footprint, retaining
// the line's integrated energy as the bright core becomes subpixel.
float coverage(float d, float sigma, float pixel) {
  float spread = sqrt(sigma * sigma + pixel * pixel / 12.0);
  float x = d / spread;
  return (sigma / spread) * exp(-0.5 * x * x);
}

vec2 glow(float d, float core, float halo, float pixel) {
  return vec2(coverage(d, core, pixel), coverage(d, halo, pixel));
}

// Integral of a periodic pulse with duty 0.18. Average over the pixel and
// smoothly remove the remaining contrast as the period becomes unresolved.
float lineIntegral(float x) { return floor(x) * 0.18 + min(fract(x), 0.18); }

void main() {
  vec2 p = vLocal;
  vec2 q = abs(p);
  float pixel = max(fwidth(p.x), fwidth(p.y));
  float phase = p.y / 0.055 - uTime * 0.65;
  float footprint = max(fwidth(phase), 0.001);
  float halfPixel = 0.5 * footprint;
  float line = (lineIntegral(phase + halfPixel) - lineIntegral(phase - halfPixel)) / footprint;
  float micro = (line - 0.18) * (1.0 - smoothstep(0.50, 0.95, footprint));

  float outer = hullDistance(p);
  float rim, seam;
  bool opening;
  bool hub = false;
  float seamMask = 1.0;
  if (uStyle < 0.5) {
    float r = length(p);
    float angle = p.x == 0.0 ? sign(p.y) * TAU * 0.25 : atan(p.y, p.x);
    float center = uOpen * STEP;
    float fromCenter = mod(angle - center + TAU * 1.5, TAU) - TAU * 0.5;
    float sector = mod(floor(mod(angle + TAU + WEDGE, TAU) / STEP), 8.0);
    hub = r < HUB;
    opening = !hub && sector == uOpen;
    float arc = length(p - HUB * direction(center + clamp(fromCenter, -WEDGE, WEDGE)));
    rim = min(arc, min(radialEdge(p, direction(center - WEDGE)), radialEdge(p, direction(center + WEDGE))));
    vec2 nearestSpoke = direction((floor(angle / STEP) + 0.5) * STEP);
    seam = min(radialEdge(p, nearestSpoke), abs(r - HUB));
    // This mask applies to the entire seam contribution, including its halo.
    // The exposed portion of the hub boundary belongs to L1 above.
    seamMask = step(HUB, r);
  } else {
    bool diamond = uStyle > 1.5;
    vec2 pane = diamond ? vec2(p.x + p.y, p.x - p.y) * INV_SQRT2 : p;
    rim = boxSdf(pane, diamond ? ${DIAMOND_EXTENT} * INV_SQRT2 : ${SQUARE_HALF});
    // Match the CPU's strict inequalities before distance normalization.
    opening = diamond ? q.x + q.y < ${DIAMOND_EXTENT} : max(q.x, q.y) < ${SQUARE_HALF};
    seam = diamond ? min(q.x, q.y) : abs(q.x - q.y) * INV_SQRT2;
  }
  // The wall vertices are already clipped by the aperture profile. A
  // coplanar radial wall must survive rounding on the half-open sector edge.
  if (vDepth < 0.5 || (opening && vWall < 0.5)) discard;

  vec2 l1 = glow(abs(rim), 0.012, 0.055, pixel);
  vec2 l2 = glow(seam, 0.009, 0.033, pixel) * seamMask * (1.0 - smoothstep(0.05, 0.7, l1.y));
  vec2 l3 = glow(outer, 0.007, 0.022, pixel);
  float emission = dot(l1, vec2(1.65, 0.48)) + dot(l2, vec2(0.58, 0.16)) + dot(l3, vec2(0.31, 0.09));
  float energy = dot(l1, vec2(0.34, 0.12)) + dot(l2, vec2(0.14, 0.04)) + dot(l3, vec2(0.08, 0.025));
  float paneLight = mix(0.63, 1.05, clamp(p.y / (2.0 * B) + 0.5, 0.0, 1.0));
  float pane = paneLight * (hub ? 0.55 : 0.76) + micro * (hub ? 0.09 : 0.29);
  vec3 col = uColor * (pane + emission + vWall * 0.12) + vec3(0.09) * l1.x;
  col = mix(col, vec3(1.0, 0.5, 0.5), uHit * 0.8);
  float alpha = (hub ? 0.18 : 0.14) + micro * 0.043 + energy + vWall * 0.065;
  gl_FragColor = vec4(col, clamp(alpha * uFade, 0.0, 1.0));
}
`;
