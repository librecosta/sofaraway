import * as THREE from 'three';
import { BRANCH_SPACING, ROUTE_LABELS, routeSides, SPLIT_BEAT } from '../core/branches';
import type { BranchLayout, RouteKind, RouteSide } from '../core/branches';
import { daybreakRouteSwatches, daybreakRouteTones, ease, routeSwatches, routeTone } from '../core/lighting-score';
import type { LightTone } from '../core/lighting-score';
import { SECTION } from '../core/collision';
import { CABIN_WAIST, cabinEnvelope, cabinLower, cabinUpper } from './cabin-geometry';
import { BranchPath, pathFrame } from './branch-path';
import type { PathFrame } from './path';
import { surfaceUV } from './materials/uv';
import { linearSwatch } from './corridor-lights.client';

const styles = {
  main: { spacing: 6.8, width: 0.018, brightness: 0.62 },
  challenge: { spacing: 4.3, width: 0.020, brightness: 0.54 },
  score: { spacing: 8.5, width: 0.025, brightness: 0.65 },
} satisfies Record<RouteKind, { spacing: number; width: number; brightness: number }>;

const routeIndex = { main: 0, challenge: 1, score: 2 } satisfies Record<RouteKind, number>;
const daylightRailColors = Object.fromEntries(Object.entries(daybreakRouteSwatches).map(([route, color]) =>
  [route, linearSwatch(color)])) as Record<RouteKind, THREE.Color>;
function guideMaterial(level: THREE.Vector3, tint: THREE.Color[]) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true, toneMapped: false });
  material.onBeforeCompile = shader => {
    shader.uniforms.uRouteLevel = { value: level };
    shader.uniforms.uRouteTint = { value: tint };
    shader.vertexShader = 'attribute float routeLight; uniform vec3 uRouteLevel, uRouteTint[3];\n' +
      shader.vertexShader.replace('#include <color_vertex>',
        '#include <color_vertex>\n int lane = int(routeLight + 0.5); if (lane < 3) vColor.rgb *= uRouteLevel[lane] * uRouteTint[lane];');
  };
  return material;
}
const signMaterial = (map: THREE.Texture, color = new THREE.Color(0xffffff)) =>
  new THREE.MeshBasicMaterial({ map, color, side: THREE.DoubleSide, toneMapped: false });

/** Retain the two program variants until VolumeScene disposal, before the audio clock is running. */
export function prepareJunctionPrograms(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
  geometry.setAttribute('routeLight', new THREE.Float32BufferAttribute(new Float32Array(4), 1));
  const pixel = document.createElement('canvas');
  pixel.width = pixel.height = 1;
  const texture = new THREE.CanvasTexture(pixel);
  const guide = guideMaterial(new THREE.Vector3(1, 1, 1), Array.from({ length: 3 }, () => new THREE.Color(0xffffff)));
  const sign = signMaterial(texture);
  const meshes = [new THREE.Mesh(geometry, guide), new THREE.Mesh(geometry, sign)];
  const dispose = () => { guide.dispose(); sign.dispose(); texture.dispose(); };
  scene.add(...meshes);
  try {
    renderer.compile(scene, camera);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  } finally {
    scene.remove(...meshes);
    geometry.dispose();
  }
}

type Point = [number, number];
const { a, b, ch } = SECTION;
function profile(w: number): Point[] {
  return [[-w + ch, -b], [w - ch, -b], [w, -b + ch], [w, b - ch],
    [w - ch, b], [-w + ch, b], [-w, b - ch], [-w, -b + ch]];
}

function perimeter(points: Point[]) {
  const lengths = [0];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    lengths.push(lengths[i] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  return lengths;
}

class Quads {
  private readonly position: number[] = [];
  private readonly uv: number[] = [];
  private readonly color: number[] = [];
  private readonly channels: number[] = [];
  private readonly indices: number[] = [];
  private readonly temp = new THREE.Vector3();
  lane = 0;

  quad(first: PathFrame, last: PathFrame, p: Point, q: Point, r: Point, s: Point,
    uvStart = 0, uvEnd = 1, color?: THREE.Color, mapped?: readonly number[]) {
    const n = this.position.length / 3;
    for (const [frame, [x, y]] of [[first, p], [first, q], [last, r], [last, s]] as const) {
      this.temp.copy(frame.p).addScaledVector(frame.r, x).addScaledVector(frame.u, y);
      this.position.push(this.temp.x, this.temp.y, this.temp.z);
      if (color) { this.color.push(color.r, color.g, color.b); this.channels.push(this.lane); }
    }
    this.uv.push(...(mapped ?? [0, uvStart, 1, uvStart, 1, uvEnd, 0, uvEnd]));
    this.indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }

  geometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.color.length) {
      geo.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
      geo.setAttribute('routeLight', new THREE.Float32BufferAttribute(this.channels, 1));
    }
    geo.setIndex(this.indices);
    geo.computeVertexNormals();
    return geo;
  }
}

export class BranchVisual {
  readonly group = new THREE.Group();
  readonly tones: Record<RouteKind, LightTone> = {
    main: routeTone('main', SPLIT_BEAT), challenge: routeTone('challenge', SPLIT_BEAT), score: routeTone('score', SPLIT_BEAT),
  };
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly near = pathFrame();
  private readonly far = pathFrame();
  private readonly level = new THREE.Vector3(1, 1, 1);
  private readonly tint = Array.from({ length: 3 }, () => new THREE.Color(0xffffff));
  get lightLevel() { return this.level.x; }

  constructor(readonly path: BranchPath, readonly layout: BranchLayout, shell: THREE.Material, private readonly canopy?: THREE.Material) {
    this.group.name = canopy ? 'skyglass-junction' : 'elsewhere-junction';
    const housing = new Quads();
    const rails = new Quads();
    const entry = path.distanceAt(path.openBeat);
    const exit = path.distanceAt(path.mergeBeat);
    if (canopy) {
      this.cabin(shell, canopy);
    } else {
      this.sweep(housing, 'center', path.start, entry, true);
      this.sweep(housing, 'center', exit, path.end, true);
      this.dividers(housing, path.openBeat);
      this.dividers(housing, path.mergeBeat);
    }
    for (const side of routeSides) {
      const route = layout[side], style = styles[route];
      rails.lane = routeIndex[route];
      if (!canopy) this.sweep(housing, side, entry, exit, false);
      this.frames(rails, side, entry, exit, canopy ? 14 : style.spacing, style.width, new THREE.Color().setScalar(style.brightness));
      const guide = new THREE.Color().setScalar(.63);
      if (canopy) {
        this.cabinRails(rails, side);
      } else {
        this.guide(rails, side, path.split, entry, guide);
        this.guide(rails, side, exit, path.end, guide);
      }
      this.sign(side, route);
    }
    if (!canopy) {
      const housingMesh = new THREE.Mesh(housing.geometry(), shell);
      housingMesh.name = 'junction-shell';
      this.group.add(housingMesh);
    }
    const glow = guideMaterial(this.level, this.tint);
    this.materials.push(glow);
    const railMesh = new THREE.Mesh(rails.geometry(), glow);
    railMesh.name = 'junction-guides';
    this.group.add(railMesh);
    if (canopy) this.updateLighting(path.spec.split, 1);
  }

  private cabin(shell: THREE.Material, canopy: THREE.Material) {
    const { path } = this;
    const span = (side: RouteSide, from: number, to: number) => ({
      from, to, sample: (s: number, frame: PathFrame) => path.sample(s, side, frame),
    });
    const expand = (from: number, to: number) => ({
      ...span('center', from, to),
      widen: (station: number) => path.spreadAt(station, path.start),
      raise: (station: number) => path.spec.rise * path.spreadAt(station, path.start) / path.spec.spacing,
    });
    const spans = [expand(path.start, path.open), expand(path.merge, path.end),
      ...routeSides.map(side => span(side, path.open, path.merge))];
    for (const upper of [false, true]) {
      const mesh = new THREE.Mesh(cabinEnvelope(spans, 3, upper), upper ? canopy : shell);
      mesh.name = upper ? 'junction-skyglass' : 'junction-shell';
      mesh.renderOrder = upper ? 4 : 0;
      this.group.add(mesh);
    }
    this.cabinPortals(shell, canopy);
  }

  private cabinPortals(shell: THREE.Material, canopy: THREE.Material) {
    const { spacing, rise } = this.path.spec;
    const silhouette = [...cabinLower, ...cabinUpper.slice(1, -1).reverse()];
    const outer = silhouette.map(([x, y]) => new THREE.Vector2(x + Math.sign(x) * (spacing + .005),
      y + (y > CABIN_WAIST ? rise : 0) + (y < 0 ? -.005 : .005)));
    const holes = [-1, 0, 1].map(side => silhouette.map(([x, y]) =>
      new THREE.Vector2(x * .999 + spacing * side, y * .999 + (side ? rise : 0))));
    const points = [outer, ...holes].flat();
    const faces = THREE.ShapeUtils.triangulateShape(outer, holes);
    const cut = (polygon: THREE.Vector2[], keepUpper: boolean) => polygon.flatMap((point, i) => {
      const next = polygon[(i + 1) % polygon.length];
      const a = point.y - CABIN_WAIST, b = next.y - CABIN_WAIST;
      const kept = keepUpper ? a >= 0 : a <= 0;
      const crossing = a * b < 0 ? [point.clone().lerp(next, a / (a - b))] : [];
      return kept ? [point, ...crossing] : crossing;
    });
    for (const upper of [false, true]) {
      const pos: number[] = [], uv: number[] = [];
      const world = new THREE.Vector3();
      const panels = faces.map(face => cut(face.map(index => points[index]), upper));
      for (const station of [this.path.open, this.path.merge]) {
        const frame = this.path.sample(station, 'center', this.near);
        for (const panel of panels) for (let i = 1; i < panel.length - 1; i++) {
          for (const { x, y } of [panel[0], panel[i], panel[i + 1]]) {
            pos.push(...world.copy(frame.p).addScaledVector(frame.r, x).addScaledVector(frame.u, y));
            uv.push(...(upper ? [.35 + x / 120, y / 21 + .29] : surfaceUV('alloy-satin-dark', x, 0, 0, y)));
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, upper ? canopy : shell);
      mesh.name = upper ? 'junction-glass-portals' : 'junction-solid-portals';
      mesh.renderOrder = upper ? 4 : 0;
      this.group.add(mesh);
    }
  }

  updateLighting(beat: number, base: number, gain = 1) {
    this.level.setScalar(this.canopy ? 1.19 * THREE.MathUtils.lerp(1, gain, .51) : base * gain);
    for (const route of ['main', 'challenge', 'score'] as const) {
      const tone = this.tones[route] = this.canopy ? daybreakRouteTones[route] : routeTone(route, beat);
      const color = this.tint[routeIndex[route]];
      if (this.canopy) color.copy(daylightRailColors[route]);
      else color.setHSL(tone.hue, tone.saturation, .56);
    }
  }

  private sweep(target: Quads, side: RouteSide, from: number, through: number, wide: boolean) {
    const width = (s: number) => a + (wide ? this.path.spreadAt(s, this.path.start) : 0);
    const count = Math.ceil((through - from) / 2.5);
    let last = from;
    let previous = profile(width(last));
    let previousLengths = perimeter(previous);
    this.path.sample(last, side, this.near);
    for (let k = 1; k <= count; k++) {
      const s = THREE.MathUtils.lerp(from, through, k / count);
      const next = profile(width(s));
      const lengths = perimeter(next);
      this.path.sample(s, side, this.far);
      for (let i = 0; i < next.length; i++) {
        const j = (i + 1) % next.length;
        const uv = (along: number, station: number) => surfaceUV('alloy-satin-dark', along, 0, 0, station);
        target.quad(this.near, this.far, previous[i], previous[j], next[j], next[i], 0, 1, undefined,
          [...uv(previousLengths[i], last), ...uv(previousLengths[i + 1], last), ...uv(lengths[i + 1], s), ...uv(lengths[i], s)]);
      }
      this.near.p.copy(this.far.p); this.near.r.copy(this.far.r); this.near.u.copy(this.far.u);
      previous = next;
      previousLengths = lengths;
      last = s;
    }
  }

  private dividers(target: Quads, beat: number) {
    const frame = this.path.sample(this.path.distanceAt(beat), 'center', this.near);
    const p = profile(a);
    const right = [p[1], p[2], p[3], p[4]];
    const left = [p[0], p[7], p[6], p[5]];
    // Only the two webs between the three octagonal openings are closed.
    for (const start of [-BRANCH_SPACING, 0]) {
      for (let i = 0; i < 3; i++) {
        const edge = ([x, y]: Point, offset: number): Point => [x + offset, y];
        const p = edge(right[i], start), q = edge(left[i], start + BRANCH_SPACING);
        const r = edge(left[i + 1], start + BRANCH_SPACING), s = edge(right[i + 1], start);
        target.quad(frame, frame, p, q, r, s, 0, 1, undefined, [p, q, r, s].flatMap(([x, y]) =>
          surfaceUV('alloy-satin-dark', x, 0, 0, y)));
      }
    }
  }

  private frames(target: Quads, side: RouteSide, from: number, to: number,
    spacing: number, width: number, color: THREE.Color) {
    const p = profile(a);
    const inner = ([x, y]: Point): Point => [x * (1 - width), y * (1 - width)];
    for (let s = from + 0.02; s <= to; s += spacing) {
      const frame = this.path.sample(s, side, this.near);
      for (let i = 0; i < p.length; i++) {
        const j = (i + 1) % p.length;
        target.quad(frame, frame, p[i], p[j], inner(p[j]), inner(p[i]), 0, 1, color);
      }
    }
  }

  private guide(target: Quads, side: RouteSide, from: number, through: number, color: THREE.Color) {
    const count = Math.ceil((through - from) / 2);
    for (let i = 0; i < count; i++) {
      const first = this.path.sample(THREE.MathUtils.lerp(from, through, i / count), side, this.near);
      const last = this.path.sample(THREE.MathUtils.lerp(from, through, (i + 1) / count), side, this.far);
      const y = -b + 0.065;
      target.quad(first, last, [-0.07, y], [0.07, y], [0.07, y], [-0.07, y], 0, 1, color);
    }
  }

  private cabinRails(target: Quads, side: RouteSide) {
    const { path } = this;
    // The floor marks the chosen lane all the way through the shared throats.
    // The waist rails stop at the portals where the three cabins share a wall.
    const sweep = (from: number, through: number, x: number, y: number, width: number, wall: boolean) => {
      const count = Math.ceil((through - from) / 3);
      for (let i = 0; i < count; i++) {
        const lo = THREE.MathUtils.lerp(from, through, i / count), hi = THREE.MathUtils.lerp(from, through, (i + 1) / count);
        const level = ease(((lo + hi) * .5 - from) / 12) * ease((through - (lo + hi) * .5) / 12);
        const color = new THREE.Color().setScalar(level * (wall ? .73 : .58));
        const first = path.sample(lo, side, this.near), last = path.sample(hi, side, this.far);
        const p: Point = wall ? [x, y - width] : [x - width, y];
        const q: Point = wall ? [x, y + width] : [x + width, y];
        target.quad(first, last, p, q, q, p, 0, 1, color);
      }
    };
    const guideStart = path.split + (side === 'center' ? 0 : (path.open - path.split) * .44);
    const guideEnd = path.merge + (path.end - path.merge) * (side === 'center' ? 1 : .53);
    sweep(guideStart, guideEnd, 0, -b + .065, .052, false);
    for (const sign of [-1, 1]) sweep(path.open, path.merge, sign * (a - .035), CABIN_WAIST - .20, .044, true);
  }

  private sign(side: RouteSide, route: RouteKind) {
    const canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = this.canopy ? '#b9d7df' : '#10171d';
    ctx.fillRect(0, 0, 384, 96);
    const swatch = this.canopy ? { main: '#163d4b', challenge: '#5a2547', score: '#604018' }[route] : routeSwatches[route];
    ctx.strokeStyle = ctx.fillStyle = swatch;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 378, 90);
    ctx.font = 'bold 43px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ROUTE_LABELS[route], 192, 49);
    const texture = new THREE.CanvasTexture(canvas);
    this.textures.push(texture);
    const material = signMaterial(texture, linearSwatch(swatch).lerp(new THREE.Color(0xffffff), 0.8));
    this.materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), material);
    const frame = this.path.sample(this.path.distanceAt(this.path.openBeat - 0.07), side, this.near);
    mesh.position.copy(frame.p).addScaledVector(frame.u, 2.28);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.r, frame.u, frame.f.clone().negate()));
    mesh.name = `junction-sign:${side}:${route}`;
    this.group.add(mesh);
  }

  dispose() {
    this.group.removeFromParent();
    for (const child of this.group.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
    this.group.clear();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
