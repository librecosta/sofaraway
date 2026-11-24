import * as THREE from 'three';
import { routeSides } from '../core/branches';
import type { BranchLayout, RouteSide } from '../core/branches';
import { facilityStages } from '../core/descent-facility';
import { descentRouteSwatches } from '../core/descent-routes';
import { SECTION } from '../core/section';
import type { BranchPath } from './branch-path';
import { collar, conduit, crossBeam, point, section } from './descent-architecture';
import { ControlLamp, FacilityLightShape } from '../core/descent-lighting';
import { FacilityInstallations } from './descent-installations.client';
import { IndustrialGeometry, IndustrialSurface } from './industrial-geometry';
import type { PathFrame } from './path';

const routeLayers = { main: 0, challenge: 1, score: 2 } as const;
const armor = new THREE.Color(0x39515e);
const rail = new THREE.Color(0x7e96a8);
const rib = new THREE.Color(0x586a78);
const work = new THREE.Color(0xb0c6d0);
const { width, height } = facilityStages[2];
const quadrants = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;

function envelope(path: BranchPath, station: number) {
  const swell = path.spreadAt(station, path.start) / path.spec.spacing;
  return [width + 1.15 * swell, height + 2.35 * swell] as const;
}

function edgeDistance(x: number, y: number, width: number, height: number) {
  const dx = Math.abs(x) / width, dy = Math.abs(y) / height;
  return Math.min(SECTION.a / dx, SECTION.b / dy, (SECTION.a + SECTION.b - SECTION.ch) / (dx + dy));
}

function runner(path: BranchPath, station: number, side: Exclude<RouteSide, 'center'>, base: PathFrame, frame: PathFrame) {
  const radial = frame.p.clone().sub(base.p);
  if (radial.lengthSq() < 1e-8) {
    const entry = station < path.open ? 1 : -1;
    radial.copy(base.r).multiplyScalar(side === 'left' ? -entry : entry);
  }
  radial.normalize();
  return { radial, x: radial.dot(frame.r) * 4.72, y: radial.dot(frame.u) * 4.72 };
}

/** A shared transfer chamber with open guideways on the same frames the pilot flies. */
export class DescentJunction {
  readonly group = new THREE.Group();

  constructor(readonly path: BranchPath, readonly layout: BranchLayout, shell: THREE.Material, fixtures: THREE.Material,
    installation: THREE.ShaderMaterial) {
    this.group.name = 'descent-spiral-junction';
    const length = path.end - path.start;
    const gantries = Array.from({ length: 10 }, (_, i) => {
      const station = path.start + length * (i + .5) / 10;
      const base = path.base.sample(station);
      const [w, h] = envelope(path, station);
      const separated = station >= path.open && station <= path.merge;
      const lampHeight = separated ? 3.48 : SECTION.b * (h - .15) - .034;
      return { station, base, w, h, separated, lampHeight,
        workLights: [-1, 1].map(sign => ({
          origin: point(base, 0, sign * lampHeight), group: sign < 0 ? ControlLamp.Floor : ControlLamp.Roof, station,
        })) };
    });
    const workLights = gantries.flatMap(gantry => gantry.workLights);
    const lampDelta = new THREE.Vector3();
    const metal = new IndustrialGeometry((p, normal, target) => {
      let spill = .11, strongest = 0;
      for (const { origin, group, station } of workLights) {
        lampDelta.subVectors(origin, p);
        const distance = lampDelta.length();
        if (distance >= 17 || distance < .001) continue;
        const falloff = 1 - distance / 17;
        const strength = falloff * falloff * (.19 + .22 * Math.max(0, normal.dot(lampDelta) / distance));
        spill += strength;
        if (strength > strongest) {
          strongest = strength;
          target.group = group;
          target.station = station;
        }
      }
      return Math.min(.59, spill);
    });
    const lights = new IndustrialGeometry(undefined, true);
    const optics = new FacilityInstallations();
    const count = Math.ceil(length / 5);
    const stations = new Set([path.start, path.split, path.open, path.merge, path.end]);
    for (let i = 1; i < count; i++) stations.add(path.start + i * length / count);
    const slices = [...stations].sort((a, b) => a - b).map(station => {
      const base = path.base.sample(station);
      const [w, h] = envelope(path, station);
      return { station, base, w, h, wall: section(base, w, h) };
    });

    const tint = new THREE.Color();
    for (let i = 1; i < slices.length; i++) {
      const a = slices[i - 1], b = slices[i];
      const mid = (a.station + b.station) / 2;
      const progress = (mid - path.start) / length;
      for (let edge = 0; edge < a.wall.length; edge++) {
        const next = (edge + 1) % a.wall.length;
        metal.quad(a.wall[edge], a.wall[next], b.wall[next], b.wall[edge],
          tint.copy(armor).multiplyScalar(edge % 4 === 0 ? .84 : 1), IndustrialSurface.Cast, [a.station, b.station]);
      }
      lights.lightAt(ControlLamp.Route, a.station, b.station);
      for (const sign of [-1, 1]) for (const level of [-1, 1]) {
        const x = sign * (SECTION.a + .18), y = level * 1.12;
        const approach = level < 0 && b.station <= path.split;
        const route = approach ? layout[sign < 0 ? 'left' : 'right'] : 'main';
        conduit(metal, a.base, b.base, x, y, .26, .24, rail, IndustrialSurface.Machined);
        conduit(lights, a.base, b.base, x - sign * .15, y, .035, approach ? .12 : .058,
          tint.set(descentRouteSwatches[route]));
        const at = [x - sign * .267, y] as const;
        optics.track(a.base, b.base, at, [0, 1], .34, a.station, b.station,
          ControlLamp.Route, FacilityLightShape.Transfer, approach ? .5 : 0, 1, at, progress, routeLayers[route]);
      }
      for (const [side, level] of quadrants) {
        conduit(metal, a.base, b.base, side * 2.25 * a.w, level * 2.59 * a.h, .63, .55, rib,
          IndustrialSurface.Cast, side * 2.25 * b.w, level * 2.59 * b.h);
      }
      if (a.station < path.split) continue;
      for (const side of ['left', 'right'] as const) {
        const from = path.sample(a.station, side), to = path.sample(b.station, side);
        const start = runner(path, a.station, side, a.base, from), end = runner(path, b.station, side, b.base, to);
        conduit(metal, from, to, start.x, start.y, .60, .56, rail, IndustrialSurface.Machined, end.x, end.y);
        conduit(lights, from, to, start.x * .92, start.y * .92, .094, .09,
          tint.set(descentRouteSwatches[layout[side]]), IndustrialSurface.Machined, end.x * .92, end.y * .92);
        const outer = [start.x * .818, start.y * .818] as const;
        const arcStart = path.arcAt(a.station, side), arcEnd = path.arcAt(b.station, side);
        const layer = routeLayers[layout[side]];
        optics.track(from, to, outer, [-start.y / 4.72, start.x / 4.72], .73, arcStart, arcEnd,
          ControlLamp.Route, FacilityLightShape.Transfer, .78, 1, [end.x * .818, end.y * .818], progress, layer);
        if (a.station < path.open || b.station > path.merge) continue;
        for (const x of [-2.05, 2.05]) {
          conduit(metal, from, to, x, -3.46, .48, .42, armor, IndustrialSurface.Coated);
          conduit(lights, from, to, x, -3.22, .08, .055, tint);
          const at = [x, -3.18] as const;
          optics.track(from, to, at, [1, 0], .43, arcStart, arcEnd,
            ControlLamp.Route, FacilityLightShape.Transfer, .78, .78, at, progress, layer);
        }
      }
    }

    // The outer ribs carry the guideways and leave each flight envelope open.
    for (const { station, base, w, h, separated, lampHeight } of gantries) {
      collar(metal, base, w - .13, h - .15, w + .07, h + .10, .87, rib, rail);
      for (const y of [-1, 1]) {
        if (separated) crossBeam(metal, base, [-4.45, y * 3.75], [4.45, y * 3.75], .26, .95, rib);
        lights.lightAt(y < 0 ? ControlLamp.Floor : ControlLamp.Roof, station);
        crossBeam(lights, base, [-2.4, y * lampHeight], [2.4, y * lampHeight], .055, .86, work);
      }
      if (!separated) continue;
      for (const side of routeSides) {
        const frame = path.sample(station, side);
        collar(metal, frame, 1.09, 1.14, 1.20, 1.25, .55, rail, rib,
          undefined, IndustrialSurface.Machined, IndustrialSurface.Coated);
        if (side === 'center') {
          const normal = path.sample(station, 'right').p.sub(base.p).normalize().cross(base.f);
          for (const sign of [-1, 1]) {
            const dx = normal.dot(base.r) * sign, dy = normal.dot(base.u) * sign;
            const skin = edgeDistance(dx, dy, w, h);
            const throat = edgeDistance(dx, dy, 1.18, 1.22);
            crossBeam(metal, base, [dx * throat, dy * throat], [dx * skin, dy * skin], .43, .85, rib);
          }
          continue;
        }
        const { radial, x, y } = runner(path, station, side, base, frame);
        const wall = edgeDistance(radial.dot(base.r), radial.dot(base.u), w, h);
        const anchor = base.p.clone().addScaledVector(radial, wall);
        metal.beam(point(frame, x, y), anchor, base.f, .29, .82, rib, IndustrialSurface.Cast);
        lights.lightAt(ControlLamp.Route, station);
        crossBeam(lights, frame, [-2.15, -3.09], [2.15, -3.09], .054, .56, tint.set(descentRouteSwatches[layout[side]]));
        crossBeam(metal, frame, [-2.55, -3.35], [2.55, -3.35], .31, .58, rail);
      }
    }
    // Switch shoes seat the outer runners against the existing spine rails.
    for (const station of [path.split, path.end]) {
      const frame = path.base.sample(station);
      for (const [side, level] of quadrants) {
        crossBeam(metal, frame, [side * 4.72, 0], [side * (SECTION.a + .18), level * 1.12],
          .16, .74, rail, 0, IndustrialSurface.Machined);
      }
    }
    const hull = new THREE.Mesh(metal.build(), shell);
    hull.name = 'descent-transfer-chamber';
    const guides = new THREE.Mesh(lights.build(), fixtures);
    guides.name = 'descent-transfer-guideways';
    this.group.add(hull, guides);
    const chase = optics.build(installation);
    if (chase) {
      chase.name = 'descent-transfer-chase';
      chase.onBeforeRender = () => { installation.uniformsNeedUpdate = true; };
      this.group.add(chase);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const mesh of this.group.children as THREE.Mesh[]) {
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      mesh.geometry.dispose();
    }
    this.group.clear();
  }
}
