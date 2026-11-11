import * as THREE from 'three';
import { routeSides } from '../core/branches';
import type { BranchLayout, RouteKind, RouteSide } from '../core/branches';
import { routeGlyphs } from './route-glyphs';

const colors = { main: '#76fadc', challenge: '#ffc27d', score: '#c7aeff' } satisfies Record<RouteKind, string>;
const depth = 8;

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
  return new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelThickness: 0.024, bevelSize: 0.026,
    bevelSegments: 2, curveSegments: 8 });
}

function label(word: string) {
  const size = 0.00043;
  const shapes: THREE.Shape[] = [];
  let advance = 0;
  for (const letter of word.toUpperCase()) {
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
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 0.088, bevelThickness: 0.006, bevelSize: 0.007,
    bevelSegments: 1, curveSegments: 4 });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  geometry.translate(-(min.x + max.x) / 2, 0, 0);
  return geometry;
}

function material() {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color() }, emphasis: { value: 0 } },
    transparent: true,
    vertexShader: `
      varying vec3 surface;
      varying float modelY;
      void main() {
        surface = normalize(normalMatrix * normal);
        modelY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 surface;
      varying float modelY;
      uniform vec3 tint;
      uniform float emphasis;
      void main() {
        vec3 normal = normalize(surface);
        float face = smoothstep(0.48, 0.92, normal.z);
        float edge = 0.26 + 0.23 * max(0.0, normal.y);
        float bands = 0.85 + 0.15 * smoothstep(0.15, 0.63, fract(modelY * 19.0));
        vec3 lit = mix(tint * edge, mix(tint, vec3(0.92, 1.0, 1.0), 0.22 + 0.28 * emphasis), face);
        gl_FragColor = vec4(lit * mix(1.0, bands, face), 0.76 + 0.21 * emphasis);
      }`,
  });
}

/** Camera-relative geometry, composited after scene blur and bloom for consistent readability. */
export class RouteHologram {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 16);
  private readonly labels = { main: label('main'), challenge: label('challenge'), score: label('score') };
  private readonly markers = routeSides.map((side, i) => {
    const root = new THREE.Group();
    const surface = material();
    const arrowMesh = new THREE.Mesh(arrow(side), surface);
    const word = new THREE.Mesh(this.labels.main, surface);
    word.position.set(0, -0.88, 0.04);
    root.rotation.set(0.24, (1 - i) * 0.33, 0);
    root.add(arrowMesh, word);
    this.scene.add(root);
    return { root, surface, arrowMesh, word };
  });

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    const halfY = depth * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const halfX = halfY * aspect;
    const spacing = Math.min(1.94, halfX * 0.60);
    const size = Math.min(0.86, halfX * 0.29);
    for (const [index, { root }] of this.markers.entries()) {
      root.position.set((index - 1) * spacing, -halfY * 0.62 + 0.12 * size, -depth);
      root.scale.setScalar(size);
    }
  }

  prepare(renderer: THREE.WebGLRenderer) { renderer.compile(this.scene, this.camera); }

  render(renderer: THREE.WebGLRenderer, layout: BranchLayout, selected: RouteSide | null, locked: boolean) {
    for (const [index, { surface, word }] of this.markers.entries()) {
      const side = routeSides[index];
      const route = layout[side];
      word.geometry = this.labels[route];
      surface.uniforms.tint.value.set(colors[route]);
      surface.uniforms.emphasis.value = selected === side ? 1 : locked ? 0.16 : 0.42;
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
