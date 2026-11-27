import type { VolumeId } from '../../game/contracts';
import { explorerPath, type ExplorerPage, type ExplorerTopic } from './explorer-paths';

export const explorerPages = {
  overview: { label: 'Overview', title: 'Technical Explorer' },
  worlds: { label: 'Worlds', title: 'World Explorer', summary: 'Explore how four procedural environments are built.' },
  gates: { label: 'Gates', title: 'Gate Laboratory', summary: 'Inspect the shapes, apertures and glass of the obstacle library.' },
  lighting: { label: 'Lighting', title: 'Lighting Studio', summary: 'Trace how the score shapes light across each world.' },
  materials: { label: 'Materials', title: 'Material Laboratory', summary: 'Inspect procedural surfaces, texture channels and effects.' },
  gameplay: { label: 'Gameplay', title: 'Gameplay Systems', summary: 'Follow gates, pickups and branches through a run.' },
  endings: { label: 'Endings', title: 'Ending Studio', summary: 'Examine the transition from the last gate to the final frame.' },
  audio: { label: 'Audio', title: 'Audio Inspector', summary: 'Listen to the scores and inspect individual instruments.' },
  interface: { label: 'Interface', title: 'Interface Studio', summary: 'Inspect menu, in-flight and completion states.' },
  legacy: { label: 'Legacy', title: 'Legacy Experiments' },
};

export const laboratoryPages = ['worlds', 'gates', 'lighting', 'materials', 'gameplay', 'endings', 'audio', 'interface'] as const;

export const explorerVolumes = {
  elsewhere: { name: 'ELSEWHERE', number: 'I', accent: '#bea8fa',
    summary: 'A luminous tunnel built from a continuous path, with repeating surfaces and gates driven by the score.' },
  daybreak: { name: 'DAYBREAK', number: 'II', accent: '#86daff',
    summary: 'A glass flight corridor suspended over a procedural cloud sea, with high cirrus guided by branching curves.' },
  descent: { name: 'DESCENT', number: 'III', accent: '#ffc288',
    summary: 'An industrial facility assembled from repeating architectural sections, with light and motion shaped by CONTROL.' },
  orbit: { name: 'ORBIT', number: 'IV', accent: '#89eee2',
    summary: 'An open asteroid belt with world-anchored celestial landmarks, streaming debris and an evolving nebula.' },
} satisfies Record<VolumeId, { name: string; number: string; accent: string; summary: string }>;

export const explorerVolumeIds = Object.keys(explorerVolumes) as VolumeId[];

export function explorerVolume(value: string | null): VolumeId {
  if (value === 'drift') return 'daybreak';
  return explorerVolumeIds.find(id => value === id) ?? 'elsewhere';
}

export function explorerHref(page: ExplorerPage, volume?: VolumeId, anchor?: string) {
  return explorerPath(page) + (volume ? `?vol=${volume}` : '') + (anchor ? `#${anchor}` : '');
}

export const explorerSource = (path: string) => `https://github.com/librecosta/sofaraway/blob/dev/${path}`;

export const explorerTopicsContent = {
  gates: {
    method: 'The specimens use the same gate geometry and opening definitions as the game. The sectional view samples the production collision test, including each aperture, hub and laser gap.',
    source: { 'Gate geometry source': 'app/game/graphics/gates.client.ts', 'Collision source': 'app/game/core/collision.ts' },
  },
  materials: {
    method: 'The corridor library generates and caches its tiled textures. The lit specimens share a lighting rig so their roughness and metalness are comparable. Raw channels expose the texture inputs directly.',
    source: { 'Material library source': 'app/game/graphics/materials/library.client.ts', 'Texture presets source': 'app/game/graphics/materials/presets.ts' },
  },
  gameplay: {
    method: 'The production chart supplies authored beats, and the run replaces the junction segment with the chosen route. The reference track assigns world stations. Encore is a separate distance-based plan.',
    source: { 'Chart source': 'app/game/core/chart.ts', 'Branch source': 'app/game/core/branches.ts', 'Reference track source': 'app/game/core/reference-track.ts' },
  },
  endings: {
    method: 'The production ending plan places Encore and Afterglow beyond the regular course. The preview samples that plan and renders the actual world. White Escape is specific to worlds that use it.',
    source: { 'Ending plan source': 'app/game/core/encore.ts', 'Ending preview source': 'app/game/debug/outro-preview.client.ts' },
  },
  interface: {
    method: 'The iframe renders the game’s menu, HUD, overlays and results from isolated example snapshots. Preview interactions change those snapshots, and the optional corridor comes from the game renderer.',
    source: { 'Interface scenarios source': 'app/game/debug/ui-state-catalog.ts', 'Game viewport source': 'app/components/GameViewport.tsx' },
  },
} satisfies Record<Exclude<ExplorerTopic, 'worlds' | 'lighting'>, { method: string; source: Record<string, string> }>;
