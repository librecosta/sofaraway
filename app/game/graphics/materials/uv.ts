import { SECTION } from '../../core/collision';
import { surfacePresets } from './presets';
import type { SurfaceMaterialId } from './presets';

const { a, b, ch } = SECTION;
export const shellPerimeter = 4 * (a + b - 2 * ch) + 4 * Math.SQRT2 * ch;
export const satinRepeat = Math.round(shellPerimeter / surfacePresets['alloy-satin-dark'].tile[0]);

export function surfaceUV(id: SurfaceMaterialId, faceStart: number, faceWidth: number, across: number, station: number) {
  const { tile, mapping } = surfacePresets[id];
  const u = mapping === 'module' ? across * Math.max(1, Math.round(faceWidth / tile[0]))
    : (faceStart + faceWidth * across) * (id === 'alloy-satin-dark' ? satinRepeat / shellPerimeter : 1 / tile[0]);
  return [u, station / tile[1]] as const;
}
