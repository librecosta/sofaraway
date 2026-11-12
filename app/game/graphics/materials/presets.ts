interface Preset {
  name: string;
  detail: string;
  color: number;
  tile: readonly [number, number];
  resolution: 256 | 512;
  metalness: number;
  roughness: number;
  roughnessMap: boolean;
  mapping: 'world' | 'module';
}

export const surfacePresets = {
  'alloy-satin-dark': { name: 'Dark satin alloy', detail: 'Main shell and broad metal skins.',
    color: 0x303943, tile: [1.2, 1.2], resolution: 256, metalness: 0.80, roughness: 0.60, roughnessMap: false, mapping: 'world' },
  'alloy-brushed-tech': { name: 'Brushed alloy', detail: 'Fine directional finish for precision connectors.',
    color: 0x46515b, tile: [0.8, 1.6], resolution: 256, metalness: 0.85, roughness: 0.42, roughnessMap: true, mapping: 'world' },
  'panel-recessed': { name: 'Recessed panel', detail: 'A shallow perimeter joint for inset wall plates.',
    color: 0x343d46, tile: [1.75, 1.5], resolution: 256, metalness: 0.65, roughness: 0.64, roughnessMap: false, mapping: 'module' },
  'panel-reinforced': { name: 'Reinforced panel', detail: 'Broad shoulders and a pair of longitudinal channels.',
    color: 0x29333c, tile: [1.5, 3], resolution: 256, metalness: 0.75, roughness: 0.55, roughnessMap: false, mapping: 'module' },
  'floor-grip': { name: 'Floor grip', detail: 'Low sheen and fine ribs between regular joints.',
    color: 0x29343b, tile: [5.1 / 7, 1.5], resolution: 256, metalness: 0.55, roughness: 0.78, roughnessMap: false, mapping: 'module' },
  'utility-polymer': { name: 'Utility polymer', detail: 'Matte dielectric for housings and protective edges.',
    color: 0x1b242c, tile: [0.6, 0.6], resolution: 256, metalness: 0.02, roughness: 0.82, roughnessMap: false, mapping: 'world' },
} as const satisfies Record<string, Preset>;

export type SurfaceMaterialId = keyof typeof surfacePresets;
export const surfaceIds = Object.keys(surfacePresets) as SurfaceMaterialId[];

export const effectPresets = {
  'emissive-channel-cyan': { name: 'Cyan light channel', detail: 'A restrained luminous insert for recesses.' },
  'hologram-panel-cyan': { name: 'Cyan hologram film', detail: 'Transparent film with sparse scan lines and a soft edge.' },
} as const;
export type EffectMaterialId = keyof typeof effectPresets;
export const effectIds = Object.keys(effectPresets) as EffectMaterialId[];

export type SurfaceChannel = 'color' | 'height' | 'normal' | 'roughness';
export const channelNames: Record<SurfaceChannel, string> = { color: 'Base color', height: 'Height', normal: 'Normal', roughness: 'Roughness' };
export const surfaceChannels = (id: SurfaceMaterialId): SurfaceChannel[] => surfacePresets[id].roughnessMap
  ? ['color', 'height', 'normal', 'roughness'] : ['color', 'height', 'normal'];
