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
float cloudWindow(vec2 p,vec2 c,vec2 scale) { vec2 q=(p-c)*scale;return exp(-dot(q,q)); }
void main() {
  vec2 p=(vUv-.5)*vec2(6.5,4.7);
  vec2 warp=vec2(gasFbm(p*.72+seed,detail),gasFbm(p*.72+seed+13.7,detail));
  vec2 q=p+(warp-.47)*.90;
  float macro=0.0,edgeLight=0.0;
  vec2 flow=q;
  vec3 tint=vec3(.07,.18,.50);
  if(layer<.5) {
    // A broken, elliptical cloud ridge around a large empty interior.
    float arc=abs(length((q-vec2(.1,-.60))*vec2(.72,1.05))-1.55);
    macro=exp(-arc*arc*9.0)*smoothstep(-1.15,-.50,q.y);
    macro*=1.0-.84*cloudWindow(q,vec2(.65,1.04),vec2(1.8,2.4));
    flow=vec2(q.x,q.y+.50*sin(q.x));
    tint=mix(vec3(.045,.20,.48),vec3(.35,.09,.48),smoothstep(-1.5,1.5,q.x));
    edgeLight=cloudWindow(q,vec2(-1.5,.55),vec2(1.6,2.2));
  } else if(layer<1.5) {
    // A tall gas cliff with an illuminated face and an excavated dust cavern.
    float face=q.x+.15+.42*gasFbm(vec2(q.y*.95,seed+2.0),detail);
    macro=(1.0-smoothstep(-.32,.65,face))*cloudWindow(q,vec2(-.55,.0),vec2(.58,.39));
    edgeLight=exp(-face*face*15.0);
    flow=vec2(q.x*1.8+.35*q.y,q.y*.65);
    tint=mix(vec3(.025,.18,.31),vec3(.075,.48,.55),edgeLight);
  } else if(layer<2.5) {
    // Three leaning pillars, separated by real low-density gaps.
    float x=q.x-.26*q.y;
    float columns=min(abs(x+.88),min(abs(x-.1),abs(x-1.05)));
    float cap=smoothstep(-2.1,-1.1,q.y)*(1.0-smoothstep(.70,1.7,q.y));
    macro=exp(-columns*columns*14.0)*cap;
    flow=vec2(x*1.9,q.y*.7);
    edgeLight=cloudWindow(q,vec2(.40,.80),vec2(.9,2.5));
    tint=mix(vec3(.19,.045,.35),vec3(.56,.10,.25),smoothstep(-1.1,.8,q.y));
  } else {
    // Low-density foreground tributaries cross the ridge instead of cloning it.
    float a=abs(q.y-.40*q.x-.24*sin(q.x*1.5)+.5);
    float b=abs(q.y+.55*q.x-.72+.18*sin(q.x*2.0));
    macro=exp(-a*a*34.0)*.70+exp(-b*b*48.0)*.55;
    macro*=1.0-.9*cloudWindow(q,vec2(.1,.1),vec2(1.2,1.1));
    flow=vec2(q.x*.8,q.y*2.1-q.x*.7);
    tint=mix(vec3(.06,.25,.52),vec3(.42,.07,.43),smoothstep(-1.3,1.4,q.x));
  }
  float meso=gasFbm(flow*2.8+warp*1.5+seed,detail);
  float fibers=pow(max(0.0,1.0-abs(gasFbm(flow*5.2+warp*2.0,detail)*2.0-1.0)),5.0);
  float density=macro*(.27+.88*meso)*(.72+.40*fibers);
  float cavern=cloudWindow(q,layer<1.5?vec2(-.45,-.15):vec2(.4,-.1),vec2(1.3,1.9));
  float dust=macro*smoothstep(.38,.65,gasFbm(q*1.8+21.0,detail))*.70+cavern*macro*.8;
  float extinction=density*.95+dust*1.65;
  float transmittance=exp(-extinction);
  float alpha=(1.0-transmittance)*presence;
  vec3 emission=tint*density*(.78+.85*fibers)*exp(-dust*1.7);
  emission+=vec3(.85,.46,.15)*edgeLight*density*.65;
  // A few resolved stellar nurseries; derivative filtering prevents pinprick shimmer.
  float knot=cloudWindow(q,vec2(-1.48,.58),vec2(14.0,18.0))
    +cloudWindow(q,vec2(.42,.82),vec2(18.0,15.0));
  emission+=vec3(.60,.76,.86)*knot*density*.65;
  float edge=smoothstep(0.0,.16,vUv.x)*smoothstep(0.0,.16,vUv.y)*smoothstep(0.0,.16,1.0-vUv.x)*smoothstep(0.0,.16,1.0-vUv.y);
  // Extinction and emitted light are separate. Output premultiplied radiance,
  // sorted back-to-front in world space, with the shared astronomical depth test.
  alpha*=edge;
  gl_FragColor=vec4(emission/max(1.0-transmittance,.001),alpha);
  #include <colorspace_fragment>
  gl_FragColor.rgb*=gl_FragColor.a;
}`;
