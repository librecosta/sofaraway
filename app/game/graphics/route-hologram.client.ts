import * as THREE from 'three';
import { ROUTE_LABELS, routeSides } from '../core/branches';
import type { BranchLayout, RouteKind, RouteSide } from '../core/branches';
import { routeGlyphs } from './route-glyphs';

const colors = { main: '#76fadc', challenge: '#ffc27d', score: '#c7aeff' } satisfies Record<RouteKind, string>;
const depth = 8;
const lookDown = THREE.MathUtils.degToRad(13);

function extrude(shapes: THREE.Shape | THREE.Shape[], options: THREE.ExtrudeGeometryOptions) {
  const geometry = new THREE.ExtrudeGeometry(shapes, options);
  // Three puts the bevel and walls in group 1. Mark them in the same draw as the cap.
  const rim = new Float32Array(geometry.getAttribute('position').count);
  for (const group of geometry.groups) {
    if (group.materialIndex === 1) rim.fill(1, group.start, group.start + group.count);
  }
  geometry.setAttribute('rim', new THREE.BufferAttribute(rim, 1));
  return geometry;
}

function arrow(side: RouteSide) {
  const shape = new THREE.Shape();
  const flip = side === 'right' ? -1 : 1;
  const x = (v: number) => (v - 24) * flip / 42;
  const y = (v: number) => (28 - v) / 42;
  const move = (px: number, py: number) => shape.moveTo(x(px), y(py));
  const line = (px: number, py: number) => shape.lineTo(x(px), y(py));
  const curve = (a: number, b: number, c: number, d: number, e: number, f: number) =>
    shape.bezierCurveTo(x(a), y(b), x(c), y(d), x(e), y(f));
  if (side === 'center') {
    move(24, 4); line(44, 24); line(31, 24); line(31, 48); line(17, 48); line(17, 24); line(4, 24);
  } else {
    move(3, 5); line(27, 5); line(20, 12); curve(34, 17, 45, 31, 45, 48);
    line(31, 48); curve(31, 37, 25, 28, 13, 23); line(3, 33);
  }
  shape.closePath();
  return extrude(shape, { depth: 0.09, bevelThickness: 0.017, bevelSize: 0.052,
    bevelSegments: 2, curveSegments: 8 });
}

function label(word: string) {
  const size = 0.00043;
  const shapes: THREE.Shape[] = [];
  let advance = 0;
  for (const letter of word) {
    const [width, outline] = routeGlyphs[letter];
    const tokens = outline.split(' ');
    const path = new THREE.ShapePath();
    let i = 0;
    const x = () => (+tokens[i++] + advance) * size;
    const y = () => +tokens[i++] * size;
    while (i < tokens.length) {
      switch (tokens[i++]) {
        case 'm': path.moveTo(x(), y()); break;
        case 'l': path.lineTo(x(), y()); break;
        case 'q': path.quadraticCurveTo(x(), y(), x(), y()); break;
        case 'c': path.bezierCurveTo(x(), y(), x(), y(), x(), y()); break;
      }
    }
    shapes.push(...path.toShapes());
    advance += width + 26;
  }
  const geometry = extrude(shapes, { depth: 0.064, bevelThickness: 0.012, bevelSize: 0.014,
    bevelSegments: 1, curveSegments: 4 });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  geometry.translate(-(min.x + max.x) / 2, 0, 0);
  return geometry;
}

function material() {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, emphasis: { value: 0 }, time: { value: 0 } },
    transparent: true,
    vertexShader: `
      attribute float rim;
      varying vec3 surface;
      varying float modelY;
      varying float solid;
      void main() {
        surface = normalize(normalMatrix * normal);
        modelY = position.y;
        solid = rim;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 surface;
      varying float modelY;
      varying float solid;
      uniform vec3 tint;
      uniform float emphasis;
      uniform float time;
      void main() {
        float phase = modelY * 3.5 - time * 0.76;
        float gap = abs(fract(phase) - 0.5);
        float aa = clamp(fwidth(phase) * 0.5, 0.005, 0.09);
        float line = 1.0 - smoothstep(0.044, 0.044 + aa, gap);
        float halo = 1.0 - smoothstep(0.066, 0.15 + aa, gap);
        vec3 bright = mix(tint, vec3(0.93, 1.0, 1.0), 0.18 + 0.24 * emphasis);
        float edgeLight = 0.5 + 0.42 * max(0.0, normalize(surface).y);
        vec3 outline = bright * edgeLight * (0.77 + 0.23 * emphasis);
        float fill = 0.055 + 0.09 * halo + (0.34 + 0.25 * emphasis) * line;
        gl_FragColor = vec4(mix(bright, outline, solid), mix(fill, 1.0, solid));
      }`,
  });
}

/** Camera-relative geometry, composited after scene blur and bloom for consistent readability. */
export class RouteHologram {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 16);
  private readonly labels = {
    main: label(ROUTE_LABELS.main), challenge: label(ROUTE_LABELS.challenge), score: label(ROUTE_LABELS.score),
  };
  private readonly markers = routeSides.map(side => {
    const root = new THREE.Group();
    const surface = material();
    const arrowMesh = new THREE.Mesh(arrow(side), surface);
    const word = new THREE.Mesh(this.labels.main, surface);
    word.position.set(0, -0.99, 0.031);
    word.scale.y = 1.3;
    root.rotation.x = -Math.PI / 2;
    root.add(arrowMesh, word);
    this.scene.add(root);
    return { root, surface, arrowMesh, word };
  });

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.rotation.x = -lookDown;
    this.camera.updateProjectionMatrix();
    const halfY = depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfX = halfY * aspect;
    const spacing = Math.min(1.94, halfX * 0.55);
    const size = Math.min(0.86, halfX * 0.26);
    // Place the center on a ray in the lower view. The markers themselves lie in XZ.
    const lowerY = -halfY * 0.55;
    const floorY = lowerY * Math.cos(lookDown) - depth * Math.sin(lookDown);
    const floorZ = -depth * Math.cos(lookDown) - lowerY * Math.sin(lookDown);
    for (const [index, { root }] of this.markers.entries()) {
      root.position.set((index - 1) * spacing, floorY, floorZ);
      root.scale.set(size, size * 1.45, size);
    }
  }

  prepare(renderer: THREE.WebGLRenderer) { renderer.compile(this.scene, this.camera); }

  render(renderer: THREE.WebGLRenderer, layout: BranchLayout, selected: RouteSide | null, locked: boolean, time: number) {
    for (const [index, { surface, word }] of this.markers.entries()) {
      const side = routeSides[index];
      const route = layout[side];
      word.geometry = this.labels[route];
      surface.uniforms.tint.value.set(colors[route]);
      surface.uniforms.emphasis.value = selected === side ? 1 : locked ? 0.16 : 0.42;
      surface.uniforms.time.value = time;
    }
    const autoClear = renderer.autoClear;
    try {
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = autoClear;
    }
  }

  dispose() {
    for (const geometry of Object.values(this.labels)) geometry.dispose();
    for (const { surface, arrowMesh } of this.markers) {
      surface.dispose();
      arrowMesh.geometry.dispose();
    }
    this.scene.clear();
  }
}
