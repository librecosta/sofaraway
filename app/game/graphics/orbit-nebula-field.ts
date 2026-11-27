import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { auroraDensityColumn, auroraFrame, auroraProfiles, auroraSlices } from '../core/orbit-nebula-structure';

/** One prefiltered spatial slice per plane. R/G/B are spine, branch and
 * dust densities. A stores the local tangent slope for the detail flow. */
export function bakeAuroraField(seed: number) {
  const width = 144, height = 108;
  const slices = auroraSlices.length;
  const data = new Uint8Array(width * height * slices * 4);
  const byte = (value: number) => Math.round(255 * Math.min(1, Math.max(0, value)));
  for (let col = 0; col < width; col++) {
    const x = ((col + .5) / width * 2 - 1) * auroraFrame.xExtent;
    const profiles = auroraProfiles(x);
    for (const [layer, slice] of auroraSlices.entries()) {
      const densityAt = auroraDensityColumn(profiles, x, slice.depth, seed);
      for (let row = 0; row < height; row++) {
        const y = ((row + .5) / height * 2 - 1) * auroraFrame.yExtent;
        const [spine, branch, dust, slope] = densityAt(y);
        const i = ((layer * height + row) * width + col) * 4;
        data[i] = byte(spine);
        data[i + 1] = byte(branch);
        data[i + 2] = byte(dust);
        data[i + 3] = byte(slope * .23 + .5);
      }
    }
  }
  const texture = new DataArrayTexture(data, width, height, slices);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
