import { BufferAttribute, BufferGeometry } from 'three';
import { octagon, perimeter } from '../core/lighting-atlas';
import { pathFrame } from './branch-path';
import { surfacePresets } from './materials/presets';
import { surfaceUV } from './materials/uv';
import type { Path, PathFrame } from './path';

const inset = 1 - .030;
const seam = .012;
// Endpoints are the outer start, recessed start, recessed end and outer end.
// Each quad selects two endpoints, two scales and its span across the face.
const bays = [
  [0, 1, 1, inset, 0, 1],
  [1, 2, inset, inset, 0, .5 - seam],
  [1, 2, 1, 1, .5 - seam, .5 + seam],
  [1, 2, inset, inset, .5 + seam, 1],
  [2, 3, inset, 1, 0, 1],
] as const;

// Cross-section and transverse UVs are the same in every authored bay.
const panels = octagon.map(([x, y], i) => {
  const [endX, endY] = octagon[(i + 1) % octagon.length];
  const dx = endX - x, dy = endY - y;
  const width = Math.hypot(dx, dy) || 1;
  const group = i === 0 ? 2 : i === 2 || i === 6 ? 1 : 0;
  const id = group === 2 ? 'floor-grip' : group === 1 ? 'panel-recessed' : 'alloy-satin-dark';
  const point = (across: number, scale: number) => [(x + dx * across) * scale, (y + dy * across) * scale] as const;
  return { group, nx: -dy / width, ny: dx / width, tileLength: surfacePresets[id].tile[1],
    quads: bays.map(([a, b, scaleA, scaleB, from, to]) => ({
      a, b, points: [point(from, scaleA), point(to, scaleA), point(to, scaleB), point(from, scaleB)],
      u0: surfaceUV(id, perimeter[i], width, from, 0)[0],
      u1: surfaceUV(id, perimeter[i], width, to, 0)[0],
    })),
  };
});
const groupFaceCounts = [0, 1, 2].map(group => panels.filter(panel => panel.group === group).length);

/** Recessed plates for ELSEWHERE's material-library corridor. */
export function buildTunnelPanels(path: Path, rings: readonly number[], ringFrames: readonly PathFrame[]) {
  const bayCount = rings.length - 1;
  const quadsPerFace = bayCount * bays.length;
  const vertexCount = quadsPerFace * panels.length * 4;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(positions.length);
  const uvs = new Float32Array(vertexCount * 2);
  const IndexArray = vertexCount > 0xffff ? Uint32Array : Uint16Array;
  const indices = new IndexArray(quadsPerFace * panels.length * 6);
  const geometry = new BufferGeometry();
  let groupStart = 0;
  const groupOffsets = groupFaceCounts.map((faces, group) => {
    const offset = groupStart;
    const count = faces * quadsPerFace * 6;
    geometry.addGroup(offset, count, group);
    groupStart += count;
    return offset;
  });
  let vertex = 0;
  const chamferIn = pathFrame(), chamferOut = pathFrame();
  const frames = [ringFrames[0], chamferIn, chamferOut, ringFrames[1]];
  const stations = [0, 0, 0, 0];
  for (let k = 0; k < bayCount; k++) {
    const start = rings[k], end = rings[k + 1];
    const chamfer = Math.min(.34, (end - start) * .22);
    stations[0] = start;
    stations[1] = start + chamfer;
    stations[2] = end - chamfer;
    stations[3] = end;
    const first = ringFrames[k];
    frames[0] = first;
    frames[3] = ringFrames[k + 1];
    path.sample(stations[1], chamferIn);
    path.sample(stations[2], chamferOut);

    for (const { group, nx, ny, tileLength, quads } of panels) {
      const normalX = first.r.x * nx + first.u.x * ny;
      const normalY = first.r.y * nx + first.u.y * ny;
      const normalZ = first.r.z * nx + first.u.z * ny;
      for (const { a, b, points, u0, u1 } of quads) {
        const index = groupOffsets[group];
        indices[index] = vertex;
        indices[index + 1] = vertex + 1;
        indices[index + 2] = vertex + 2;
        indices[index + 3] = vertex;
        indices[index + 4] = vertex + 2;
        indices[index + 5] = vertex + 3;
        groupOffsets[group] += 6;
        const va = stations[a] / tileLength, vb = stations[b] / tileLength;
        for (let corner = 0; corner < 4; corner++, vertex++) {
          const { p, r, u } = frames[corner < 2 ? a : b];
          const [x, y] = points[corner];
          const xyz = vertex * 3, uv = vertex * 2;
          positions[xyz] = p.x + r.x * x + u.x * y;
          positions[xyz + 1] = p.y + r.y * x + u.y * y;
          positions[xyz + 2] = p.z + r.z * x + u.z * y;
          normals[xyz] = normalX;
          normals[xyz + 1] = normalY;
          normals[xyz + 2] = normalZ;
          uvs[uv] = corner === 0 || corner === 3 ? u0 : u1;
          uvs[uv + 1] = corner < 2 ? va : vb;
        }
      }
    }
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}
