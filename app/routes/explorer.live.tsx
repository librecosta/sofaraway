import { lazy, Suspense } from 'react';
import { useLocation, useOutletContext } from 'react-router';
import type { ExplorerContext } from '../components/explorer/ExplorerLayout';
import { explorerSource, explorerVolumes } from '../components/explorer/explorer-catalog';
import { explorerPageAt } from '../components/explorer/explorer-paths';
import s from '../styles/explorer-lab.module.css';

export { meta } from './explorer.topic';

const ScenicLab = lazy(() => import('../components/explorer/ScenicLab'));
const Facility = lazy(() => import('../components/DescentFacilityPreview').then(module => ({ default: module.DescentFacilityPreview })));
const Flight = lazy(() => import('../components/OrbitFlightPreview').then(module => ({ default: module.OrbitFlightPreview })));

const notes = {
  elsewhere: {
    world: 'The reference track places the corridor, gates and junction. Corridor presets change the lighting zone and camera while the S-Curve controls let you inspect individual stations on the bend.',
    lights: 'Authored lighting zones set the corridor palette and fixture pattern. The drum envelope changes the fixture, rim and physical light levels at the selected beat.',
    sources: { 'Corridor path': 'app/game/graphics/path.ts', 'Lighting score': 'app/game/core/lighting-score.ts' },
  },
  daybreak: {
    world: 'The Skyglass cabin and its gates share the flight path. Outside the glass, a procedural cloud sea sits below the cabin and branching cirrus follows a separate cloud field above it.',
    lights: 'The production exterior samples the selected beat for the sky color and daylight. The cloud sea and cirrus respond to that lighting while the cabin stays at its world station.',
    sources: { 'Skyglass exterior': 'app/game/graphics/daybreak-exterior.client.ts', Cirrus: 'app/game/graphics/daybreak-cirrus.ts' },
  },
  descent: {
    world: 'Facility stages place architectural pieces along the track. The Transfer Chamber presets use the actual branch layout and the setpiece flights follow the same reference route as the game.',
    lights: 'CONTROL phrases drive groups of ceiling, floor, side and glass fixtures. Phrase playback fixes the camera, while a setpiece flight explicitly advances the camera through the performance.',
    sources: { 'Facility stages': 'app/game/core/descent-facility.ts', 'CONTROL lighting': 'app/game/core/descent-lighting.ts' },
  },
  orbit: {
    world: 'The reference track anchors seven cosmic setpieces. The same seeded streaming system draws the asteroid field, ring debris, nebula and distant bodies during flight.',
    lights: 'STARWAKE changes the lighting on the asteroid field, nebula and planet. The world station controls which setpieces are visible, so changing a beat leaves their positions intact.',
    sources: { 'Cosmic setpieces': 'app/game/core/orbit-setpieces.ts', 'STARWAKE lighting': 'app/game/core/orbit-lighting.ts' },
  },
};

export default function ExplorerLivePage() {
  const { pathname, search, hash } = useLocation();
  const { volume, hydrated } = useOutletContext<ExplorerContext>();
  const lab = explorerPageAt(pathname) === 'lighting' ? 'lighting' : 'worlds';
  const note = notes[volume];
  const cover = <div className={s.viewport}><img src={`/explorer/${volume}.webp`} width={768} height={432} alt="" /></div>;

  return <article className={s.lab}>
    <Suspense fallback={cover} key={`${lab}:${volume}:${search}:${hash}`}>
      {hydrated ? volume === 'orbit' ? <Flight lab={lab} />
        : volume === 'descent' ? <Facility lab={lab} />
        : <ScenicLab id={volume} lab={lab} anchor={hash} /> : cover}
    </Suspense>
    <section className={s.notes} aria-labelledby="technical-notes">
      <h2 id="technical-notes">How {explorerVolumes[volume].name} works</h2>
      <p>{lab === 'worlds' ? note.world : note.lights}</p>
      {lab === 'lighting' && <p>World station sets the camera’s location. Music beat controls the score-driven lighting independently.
        Reduced motion softens or removes rapid lighting changes.</p>}
      <div className={s.actions}>
        {Object.entries(note.sources).map(([label, path]) => <a key={path} href={explorerSource(path)}>{label} source</a>)}
      </div>
    </section>
  </article>;
}
