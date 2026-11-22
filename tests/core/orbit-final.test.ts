import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { starwakeEvents, starwakeTrack, beatSeconds } from '../../app/game/core/orbit-score';
import { orbitChart, orbitRouteCharts, orbitCueBeats } from '../../app/game/core/orbit-chart';
import { inspectorScore, stemMetadata } from '../../app/game/debug/audio/track-adapter';
import { volumeById } from '../../app/game/core/volumes';
import type { Difficulty } from '../../app/game/contracts';

const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('final STARWAKE is exactly the approved F1 score and preserves all charts and cues', () => {
  expect(hash(starwakeEvents)).toBe('8057b8deb75e18288f38fe3f2257fd95fc6c60da2263fe70add0d80b2e1f1cb6');
  const charts = Object.fromEntries((['easy','normal','hard','impossible'] as Difficulty[])
    .map(d => [d,{main:orbitChart(d),routes:orbitRouteCharts(orbitChart(d),d)}]));
  expect(hash(charts)).toBe('e4f411e7a91e3f0d5b8f2f3ec43d32063a6223fc3eb85bf7f580c026057c0877');
  expect(hash(orbitCueBeats)).toBe('0423d862a547e4929544c79ece3ea2b596b2260e2dc7a130f94c633488b6ef1d');
  expect(starwakeEvents.some(e => e.voice==='bass'||e.voice==='pluck')).toBe(false);
  expect(starwakeEvents.filter(e=>e.voice==='lead')).toHaveLength(144);
  expect(starwakeEvents.filter(e=>e.voice==='pad')).toHaveLength(53);
  expect(inspectorScore(volumeById('orbit')).tracks).toEqual(['master','kick','snare','hats','perc','pad','lead','sweep']);
});
