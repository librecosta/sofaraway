import { describe, expect, it } from 'vitest';
import { auroraBranches, auroraCavity, auroraDensityColumn, auroraProfiles, auroraSlices } from '../../app/game/core/orbit-nebula-structure';
import { bakeAuroraField } from '../../app/game/graphics/orbit-nebula-field';

describe('AURORA structure field', () => {
  it('keeps the spine continuous with changing width and fades both ends', () => {
    const profiles = Array.from({ length: 119 }, (_, i) => auroraProfiles(-2.95 + i * .05).spine!);
    for (let i = 1; i < profiles.length; i++) {
      expect(Math.abs(profiles[i].values[0] - profiles[i - 1].values[0])).toBeLessThan(.07);
      expect(profiles[i].values[2]).toBeGreaterThan(.1);
    }
    expect(Math.max(...profiles.map(profile => profile.values[2]))).toBeGreaterThan(.45);
    expect(auroraProfiles(-3.02).spine?.values[4]).toBe(0);
    expect(auroraProfiles(3.03).spine?.values[4]).toBe(0);
  });

  it('joins each distinct branch tangentially to its parent and tapers at the tip', () => {
    for (const branch of auroraBranches) {
      const root = auroraProfiles(branch.root);
      const start = root.branches.find(path => path.id === branch.id)!;
      const tip = branch.tip.at(-1)!;
      const end = auroraProfiles(tip[0]).branches.find(path => path.id === branch.id)!;
      expect(branch.parent).toBe('spine');
      expect(start.profile?.values).toEqual(root.spine?.values);
      root.spine?.slopes.forEach((slope, axis) => expect(start.profile?.slopes[axis]).toBeCloseTo(slope, 10));
      expect(start.weight).toBe(0);
      expect(Math.abs(tip[1] - auroraProfiles(tip[0]).spine!.values[0])).toBeGreaterThan(.3);
      expect(end.profile?.values[4]).toBeCloseTo(0, 7);
    }
  });

  it('leaves a translucent cavity between the spine and return flow, with dust rooted in gas', () => {
    const { x, y, depth, height } = auroraCavity;
    const densityAt = auroraDensityColumn(auroraProfiles(x), x, depth, 17);
    const center = densityAt(y);
    const wall = densityAt(y + height);
    const below = densityAt(y - height);
    const empty = auroraDensityColumn(auroraProfiles(3.1), 3.1, depth, 17)(y);
    expect(center[0] + center[1] + center[2]).toBeLessThan(.04);
    expect(wall[0]).toBeGreaterThan(.25);
    expect(wall[2]).toBeGreaterThan(.13);
    expect(below[1]).toBeGreaterThan(.14);
    expect(empty).toEqual([0, 0, 0, 0]);
  });

  it('bakes deterministic, distinct spatial slices once, independently of quality or music', () => {
    const texture = bakeAuroraField(44223);
    const repeat = bakeAuroraField(44223);
    const different = bakeAuroraField(77211);
    try {
      const { data, width, height, depth } = texture.image;
      const sameSeed = repeat.image.data, otherSeed = different.image.data;
      if (!(data instanceof Uint8Array && sameSeed instanceof Uint8Array && otherSeed instanceof Uint8Array)) {
        throw new Error('Expected an 8-bit density field');
      }
      expect(depth).toBe(auroraSlices.length);
      expect(data.length).toBe(width * height * depth * 4);
      expect(Buffer.compare(data, sameSeed)).toBe(0);
      expect(Buffer.compare(data, otherSeed)).not.toBe(0);
      const layer = width * height * 4;
      expect(Buffer.compare(data.subarray(0, layer), data.subarray(-layer))).not.toBe(0);
      expect(texture.generateMipmaps).toBe(true);
    } finally {
      texture.dispose(); repeat.dispose(); different.dispose();
    }
  });
});
