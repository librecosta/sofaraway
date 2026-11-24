import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { difficulties } from '../../game/contracts';
import type { Difficulty, VolumeId } from '../../game/contracts';
import { ROUTE_LABELS, routeSides } from '../../game/core/branches';
import type { RouteKind } from '../../game/core/branches';
import { BOOST_MULTIPLIER } from '../../game/core/reference-track';
import { gateDescription, gateOpeningAt, pickupCards } from '../../game/debug/catalog';
import { inspectGameplay } from '../../game/debug/gameplay-inspection';
import { explorerHref, explorerSource } from './explorer-catalog';
import { SpecimenCanvas, SpecimenStatus, useSpecimens } from './Specimens';
import s from '../../styles/explorer-lab.module.css';

const difficultyOptions = [...difficulties, 'impossible'] as const;
const routes = ['main', 'challenge', 'score'] as const satisfies readonly RouteKind[];
const routeParam = (route: RouteKind) => route === 'score' ? 'bonus' : route;
const name = (value: string) => value[0].toUpperCase() + value.slice(1);
const unit = (value: number) => value.toFixed(2);
type Inspection = ReturnType<typeof inspectGameplay>;
type Gate = ReturnType<Inspection['gatesFor']>['gates'][number];

function PickupGallery({ pickup }: { pickup: Inspection['pickup'] }) {
  const { hash } = useLocation();
  const [open, setOpen] = useState(hash === '#pickups');
  const [angle, setAngle] = useState(-20);
  const { root, model, status } = useSpecimens('pickups', undefined, open);
  useEffect(() => { if (status === 'ready') model.current?.drawPickups(angle); }, [angle, model, status]);
  return <section id="pickups" className={s.preview} ref={root}>
    <header className={s.notes}>
      <h2>Floating pickups</h2>
      {pickup && <p>Beat {pickup.beat} · World station {unit(pickup.station)} · The pickup becomes visible from beat {pickup.preview}.
        This seed selects {pickupCards.find(card => card.kind === pickup.kind)!.name}. The pickup is shared by all three routes.</p>}
      {pickup && <p>Flight-path offset X {pickup.x}, Y {pickup.y} · Collection radius {pickup.radius} world units</p>}
      <div className={s.actions}>
        {!open && <button type="button" onClick={() => setOpen(true)}>Open 3D pickups</button>}
        <a href={explorerSource('app/game/graphics/pickup.client.ts')}>Pickup model source</a>
        <a href={explorerSource('app/game/core/pickups.ts')}>Pickup rules source</a>
      </div>
    </header>
    {open && <>
      <SpecimenStatus status={status} />
      <fieldset className={s.group}>
        <legend>Pickup view</legend>
        <label>View angle <input type="range" aria-label="View angle" min="-85" max="85" value={angle}
          disabled={status !== 'ready'} onChange={e => setAngle(e.currentTarget.valueAsNumber)} /><output>{angle}°</output></label>
      </fieldset>
    </>}
    <div className={s.specimenGrid}>
      {pickupCards.map(({ kind, name, effect }) => <figure key={kind} className={s.specimen}>
        {open && <SpecimenCanvas id={kind} label={`${name} 3D model`} />}
        <figcaption className={s.specimenCaption}><h3>{name}</h3><p>{effect}</p></figcaption>
      </figure>)}
    </div>
  </section>;
}

function Timeline({ data, gates, selected, choose, section }: {
  data: Inspection; gates: readonly Gate[]; selected?: Gate; choose(beat: number): void; section?: Inspection['sections'][number];
}) {
  const { volume, sections, branch, pickup, endingCue } = data;
  const from = section?.start ?? 0;
  const to = section?.end ?? volume.beats;
  const position = (beat: number) => (beat - from) / (to - from) * 960 + 20;
  const range = (start: number, end: number) => {
    const left = position(Math.max(from, start));
    return [left, Math.max(0, position(Math.min(to, end)) - left)];
  };
  const ticks = [];
  const step = to - from > 150 ? 32 : to - from > 50 ? 8 : 4;
  for (let beat = Math.ceil(from / step) * step; beat <= to; beat += step) ticks.push(beat);
  const flags = [
    ...(branch ? [[branch.preview, 'Preview'], [branch.split, 'Split'], [branch.open.standard, 'Open'], [branch.merge.standard, 'Merge'], [branch.rejoin, 'Rejoin']] as const : []),
    ...(pickup ? [[pickup.beat, 'Pickup']] as const : []),
    ...(endingCue === undefined ? [] : [[endingCue, 'Ending cue']] as const),
    [volume.beats, 'Music end'] as const,
  ].filter(([beat]) => beat >= from && beat <= to);

  return <div className={s.timelineScroll} tabIndex={0} aria-label="Scrollable chart timeline">
    <svg className={s.timeline} role="group" aria-label="Chart timeline by music beat" viewBox="0 0 1000 119">
      {sections.filter(chapter => chapter.start < to && chapter.end > from).map((chapter, i) => {
        const [x, width] = range(chapter.start, chapter.end);
        return <g key={chapter.name}>
          <rect x={x} y="9" width={width} height="20" fill={i % 2 ? '#223953' : '#192b43'} />
          <text x={x + width / 2} y="23" textAnchor="middle" fill="#d7e7ff">{chapter.name}</text>
        </g>;
      })}
      {branch && branch.rejoin > from && branch.preview < to && (() => {
        const [x, width] = range(branch.preview, branch.rejoin);
        return <rect x={x} y="34" width={width} height="52" fill="#64518c" opacity=".35" />;
      })()}
      {ticks.map(beat => <g key={beat}>
        <path d={`M${position(beat)} 35v56`} stroke="#2b405a" />
        <text x={position(beat)} y="105" textAnchor="middle" fill="#aab9ce">{beat}</text>
      </g>)}
      <path d="M20 74H980" stroke="#375371" />
      {flags.map(([beat, label]) => <path key={label} stroke="#d5a0fc" d={`M${position(beat)} 36v23`}><title>{label} · Beat {beat}</title></path>)}
      {gates.map(gate => <circle key={gate.beat} className={s.gateMark} cx={position(gate.beat)} cy={gate.route ? 63 : 75}
        r={gate === selected ? 5.5 : 3} fill={gate === selected ? '#fff' : gate.inserted ? '#ffc184' : gate.route ? '#d5a0fc' : '#7ddaff'}
        onClick={() => choose(gate.beat)}><title>{gateDescription(gate.kind).label} · Beat {gate.beat}</title></circle>)}
    </svg>
  </div>;
}

export default function GameplayLab({ volume }: { volume: VolumeId }) {
  const [params, setParams] = useSearchParams();
  const [seedInput, setSeedInput] = useState<string>();
  const difficulty = difficultyOptions.find(id => id === params.get('diff')) ?? 'normal';
  const seedParam = params.get('seed') ?? '';
  const seed = /^\d+$/.test(seedParam) && Number(seedParam) < 0xffffffff ? Number(seedParam) : 0;
  const route = routes.find(id => routeParam(id) === params.get('route')) ?? 'main';
  const data = useMemo(() => inspectGameplay(volume, difficulty, seed), [volume, difficulty, seed]);
  const { authored, sections, branch, layout, rules, reference, plan } = data;
  const { side, gates, replacementCount } = useMemo(() => data.gatesFor(route), [data, route]);
  const section = sections.find(item => item.name === params.get('section'));
  const visible = useMemo(() => gates.filter(gate => !section || gate.section === section.name), [gates, section]);
  const requestedBeat = params.get('beat');
  const selected = (requestedBeat && visible.find(gate => String(gate.beat) === requestedBeat)) || visible[0];
  const update = (values: Record<string, string | null>) => {
    setParams(current => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) value === null ? next.delete(key) : next.set(key, value);
      return next;
    }, { replace: true, preventScrollReset: true });
  };
  const choose = (beat: number) => update({ beat: String(beat) });
  function commitSeed() {
    if (seedInput !== undefined && /^\d+$/.test(seedInput) && Number(seedInput) < 0xffffffff) update({ seed: seedInput });
    setSeedInput(undefined);
  }
  const worldLink = (station: number, beat: number) => explorerHref('worlds', volume) +
    `&station=${station}&beat=${beat}`;
  const gateLink = selected && explorerHref('gates', volume) + `&gate=${selected.kind}&open=${selected.open}&axis=${selected.axis}`;
  const openingName = (gate: Pick<Gate, 'kind' | 'open' | 'axis'>) =>
    gateOpeningAt(gate.kind, gate.open, gate.axis)?.label ?? String(gate.open);

  return <>
    <section id="chart" className={s.preview} aria-labelledby="chart-title">
      <h2 id="chart-title">Chart timeline</h2>
      <fieldset className={s.group}>
        <legend>Run configuration</legend>
        <label>Difficulty <select aria-label="Difficulty" value={difficulty} onChange={e => update({ diff: e.currentTarget.value as Difficulty, beat: null })}>
          {difficultyOptions.map(id => <option key={id} value={id}>{name(id)}</option>)}
        </select></label>
        <label>Route <select aria-label="Route" value={route} onChange={e => update({ route: routeParam(e.currentTarget.value as RouteKind), beat: null })}>
          {routes.map(id => <option value={id} key={id}>{ROUTE_LABELS[id]}</option>)}
        </select></label>
        <label>Section <select aria-label="Section" value={section?.name ?? ''} onChange={e => update({ section: e.currentTarget.value || null, beat: null })}>
          <option value="">Full score</option>{sections.map(chapter => <option key={chapter.name}>{chapter.name}</option>)}
        </select></label>
        <label>Run seed <input type="number" min="0" max="4294967294" step="1" value={seedInput ?? seed}
          onChange={e => setSeedInput(e.currentTarget.value)} onBlur={commitSeed} onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }} /></label>
      </fieldset>
      <div className={s.stats}>
        <div><strong data-count="main">{authored.length}</strong><span>Main chart</span></div>
        <div><strong data-count="route">{gates.length}</strong><span>Selected route · {name(routeParam(route))}</span></div>
        <div><strong data-count="encore">{plan?.gates.length ?? 0}</strong><span>Encore gates in plan</span></div>
      </div>
      <p className={s.quiet}>{rules.lives} {rules.lives === 1 ? 'life' : 'lives'} · Score ×{rules.mult} · Speed ×{rules.speedFactor}
        {' '}· {replacementCount} junction gates included in the selected route</p>
      <Timeline data={data} gates={visible} selected={selected} choose={choose} section={section} />
      <div className={s.timelineLegend}><span>Main track</span><span>Route replacement and junction window</span><span>Impossible insertion</span><span>Ticks show music beats</span></div>
      <fieldset className={s.group}>
        <legend>Selected crossing</legend>
        {selected ? <>
          <label>Gate at beat <select aria-label="Gate at beat" value={selected.beat} onChange={e => choose(Number(e.currentTarget.value))}>
            {visible.map(gate => <option value={gate.beat} key={gate.beat}>{gate.beat} · {gateDescription(gate.kind).label}</option>)}
          </select></label>
          <output aria-live="polite" data-gate-beat={selected.beat}>{selected.section} · World station {unit(selected.worldStation)}
            {' '}· Opening {openingName(selected)} ({selected.open}) · Axis {selected.axis}{selected.inserted ? ' · Impossible insertion' : ''}</output>
          <div className={s.actions}>
            <Link to={gateLink!}>Inspect gate geometry</Link>
            <Link to={worldLink(selected.worldStation, selected.beat)}>Open crossing in Worlds</Link>
          </div>
        </> : <p>No gates in this section.</p>}
      </fieldset>
    </section>
    <section className={s.preview} aria-labelledby="junction-title">
      <h2 id="junction-title">Junction and section counts</h2>
      {branch && <>
        <p className={s.quiet}>Preview {branch.preview} · Split {branch.split} · Open {branch.open.standard} · Merge {branch.merge.standard} · Rejoin {branch.rejoin} beats</p>
        <div className={s.stats}>
          {routeSides.map(lane => <div key={lane} data-side={lane} data-selected={side === lane}>
            <span>{name(lane)}</span><strong>{ROUTE_LABELS[layout[lane]]}</strong>
          </div>)}
        </div>
        <div className={s.actions}>
          <Link to={worldLink(reference.station(branch.open.standard, 'standard'), branch.open.standard)}>Inspect the junction in Worlds</Link>
          <Link to={explorerHref('endings', volume) + `&diff=${difficulty}&seed=${seed}&route=${routeParam(route)}&stage=branch`}>Open {name(routeParam(route))} route in Ending Studio</Link>
        </div>
      </>}
      <div className={s.tableScroll}>
        <table className={s.dataTable}>
          <thead><tr><th scope="col">Section</th><th scope="col">Beats</th><th scope="col">Main chart</th><th scope="col">Selected route</th></tr></thead>
          <tbody>{sections.map(chapter => <tr key={chapter.name}>
            <th scope="row"><button type="button" aria-pressed={section === chapter}
              onClick={() => update({ section: section === chapter ? null : chapter.name, beat: null })}>{chapter.name}</button></th>
            <td>{chapter.start}–{chapter.end}</td><td>{chapter.authored}</td>
            <td>{gates.filter(gate => gate.section === chapter.name).length}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <PickupGallery pickup={data.pickup} />
    <section id="encore" className={s.preview} aria-labelledby="encore-title">
      <h2 id="encore-title">Encore and reference motion</h2>
      <p className={s.quiet}>Reference motion maps an authored beat to a fixed world station. Cruise follows the normal speed ramp.
        Boost multiplies the target speed by {BOOST_MULTIPLIER} and brings crossings forward in music time.</p>
      <p className={s.quiet}>Encore gates occupy a separate distance-based plan. Their arrival beats depend on movement.</p>
      <p className={s.quiet}>Song end · {Number((data.volume.beats * 60 / data.volume.bpm).toFixed(2))} s ·
        Cruise station {unit(reference.station(data.volume.beats, 'standard'))}</p>
      <Link to={explorerHref('endings', volume) + `&diff=${difficulty}&seed=${seed}&route=${routeParam(route)}&stage=results-world`}>Inspect the result</Link>
      {plan && <details className={s.details}>
        <summary>Inspect {plan.gates.length} Encore gates and their world stations</summary>
        <div className={s.tableScroll}>
          <table className={s.dataTable}>
            <thead><tr><th scope="col">Gate</th><th scope="col">Kind</th><th scope="col">Opening</th><th scope="col">Axis</th><th scope="col">Station</th></tr></thead>
            <tbody>{plan.gates.map(gate => <tr key={gate.index}>
              <th scope="row">{gate.index + 1}</th><td>{gateDescription(gate.kind).label}</td><td>{openingName(gate)} ({gate.open})</td>
              <td>{gate.axis}</td><td>{unit(gate.worldStation)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>}
    </section>
  </>;
}
