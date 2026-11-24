export const explorerTopics = ['worlds', 'gates', 'lighting', 'materials', 'gameplay', 'endings', 'interface'] as const;
export type ExplorerTopic = typeof explorerTopics[number];
export type ExplorerPage = ExplorerTopic | 'overview' | 'audio' | 'legacy';

export function explorerPageAt(pathname: string): ExplorerPage {
  return (pathname.split('/')[2]?.toLowerCase() || 'overview') as ExplorerPage;
}

export function explorerPath(page: ExplorerPage) {
  return page === 'overview' ? '/debug/' : `/debug/${page}/`;
}
import type { VolumeId } from '../../game/contracts';


export const migratedExperiments = new Map<string, readonly [ExplorerPage, VolumeId?]>([
  ['volumes', ['worlds']],
  ['daybreak-cabin', ['worlds', 'daybreak']],
  ['environment', ['worlds', 'daybreak']],
  ['descent', ['worlds', 'descent']],
  ['orbit', ['worlds', 'orbit']],
  ['lighting', ['lighting']],
  ['s-curve', ['lighting', 'elsewhere']],
  ['beat-inspection', ['lighting']],
  ['audio', ['audio']],
]);
