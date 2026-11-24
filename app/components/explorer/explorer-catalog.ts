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

export const legacyAnchors = new Set([
  'pickups', 'gates', 'gates-elsewhere', 'gates-daybreak', 'gates-descent',
  'gates-orbit', 'materials', 'effects', 'outro', 'ui-states',
]);

export const explorerSource = (path: string) => `https://github.com/librecosta/sofaraway/blob/dev/${path}`;

type Experiment = { name: string; anchor: string; summary: string };

export const explorerTopicsContent: Record<Exclude<ExplorerTopic, 'worlds' | 'lighting'>, { method: string; source: string; experiments: Experiment[] }> = {
  gates: {
    method: 'Each volume defines a family of openings. The gate library lets you rotate their models and inspect the aperture geometry that the collision engine reads.',
    source: 'app/game/core/collision.ts',
    experiments: [{ name: 'Gate Library', anchor: 'gates', summary: 'Rotate the models and compare the opening shapes in each volume.' }],
  },
  materials: {
    method: 'Surface presets generate texture channels and feed the game’s materials. Inspect those channels individually and compare the effects applied to the world geometry.',
    source: 'app/game/graphics/materials/presets.ts',
    experiments: [
      { name: 'Surface Materials', anchor: 'materials', summary: 'Browse material presets and inspect their texture channels.' },
      { name: 'Effect Materials', anchor: 'effects', summary: 'Preview the shaders used for glow, glass and other effects.' },
    ],
  },
  gameplay: {
    method: 'The game advances in fixed simulation steps. Travel along the reference track determines when you cross gates, reach branches and collect pickups.',
    source: 'app/game/core/simulation.ts',
    experiments: [
      { name: 'Floating Pickups', anchor: 'pickups', summary: 'Inspect the pickup models and their individual gameplay effects.' },
      { name: 'Gameplay Stations', anchor: 'volumes', summary: 'Open fixed frames from the production runs to see gates and routes in context.' },
    ],
  },
  endings: {
    method: 'After the last regular gate, the run can continue through Encore and Afterglow while the soundtrack reaches its ending. The studio can scrub that transition directly.',
    source: 'app/game/core/encore.ts',
    experiments: [{ name: 'End Sequence Preview', anchor: 'outro', summary: 'Scrub DAYBREAK’s ending and compare camera, glass and cloud controls.' }],
  },
  interface: {
    method: 'Menu, HUD and results components reflect the state of the runtime. The state studio provides direct access to representative screens and transitions.',
    source: 'app/components/GameViewport.tsx',
    experiments: [{ name: 'UI State Studio', anchor: 'ui-states', summary: 'Open presets for the menu, active play, pause and results.' }],
  },
};
