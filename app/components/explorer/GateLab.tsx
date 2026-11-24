import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { VolumeId } from '../../game/contracts';
import { canPass, lanePoint, opening } from '../../game/core/collision';
import { isOrbitGate, orbitPresets } from '../../game/core/orbit-gates';
import { SECTION, SECTION_OUTLINE } from '../../game/core/section';
import type { GateKind } from '../../game/core/volumes';
import { gateDescription, gateFamilies, gateOpeningAt, gateOpenings } from '../../game/debug/catalog';
import { GLASS_THICKNESS } from '../../game/graphics/glass-geometry';
import { SpecimenCanvas, SpecimenStatus, useSpecimens } from './Specimens';
import s from '../../styles/explorer-lab.module.css';

type Variant = ReturnType<typeof gateOpenings>[number];
const sectionOutline = SECTION_OUTLINE.map(([x, y]) => [x, -y].join(',')).join(' ');
const { a, b, ch } = SECTION;

function Aperture({ kind, variant }: { kind: GateKind; variant: Variant }) {
  const { axis, open } = variant;
  const aperture = open === -1 ? open : opening(kind, open);
  const target = open === -1 ? undefined : lanePoint(kind, aperture, axis);
  const [probe, setProbe] = useState<[number, number]>(target ?? [0, 0]);
  const within = (x: number, y: number) => Math.abs(x) <= a && Math.abs(y) <= b && Math.abs(x) + Math.abs(y) <= a + b - ch;
  const passes = within(...probe) && open !== -1 && canPass(kind, aperture, axis, ...probe);
  const sampled = useMemo(() => {
    const columns = 150;
    const rows = 118;
    const dx = a * 2 / columns;
    const dy = b * 2 / rows;
    const path = [];
    for (let row = 0; row < rows; row++) {
      const y = -b + (row + .5) * dy;
      let start = -1;
      for (let col = 0; col <= columns; col++) {
        const x = -a + (col + .5) * dx;
        if (col < columns && within(x, y) && open !== -1 && canPass(kind, aperture, axis, x, y)) {
          if (start === -1) start = col;
        } else if (start !== -1) {
          path.push(`M${(-a + start * dx).toFixed(3)} ${(-y - dy / 2).toFixed(3)}h${((col - start) * dx).toFixed(3)}v${dy.toFixed(3)}H${(-a + start * dx).toFixed(3)}z`);
          start = -1;
        }
      }
    }
    return path.join('');
  }, [kind, aperture, open, axis]);

  return <section className={s.inspection} aria-labelledby="aperture-title">
    <div>
      <h2 id="aperture-title">Aperture and collision</h2>
      <p>{gateDescription(kind).label} · {variant.label}</p>
      {isOrbitGate(kind) && <p>{orbitPresets[kind][open].holes.length} physical, traversable openings. Glass thickness {GLASS_THICKNESS} world units.</p>}
      <p>The shaded region samples the same clearance test used at a gate crossing. Coordinates are local to the flight path.</p>
      <fieldset className={s.group}>
        <legend>Test a crossing</legend>
        {(['X', 'Y'] as const).map((label, index) => <label key={label}>Sample {label}
          <input aria-label={`Sample ${label}`} type="range" min={index === 0 ? -a : -b} max={index === 0 ? a : b}
            step="any" value={probe[index]} onChange={e => {
              const value = e.currentTarget.valueAsNumber;
              setProbe(index === 0 ? [value, probe[1]] : [probe[0], value]);
            }} />
        </label>)}
        <output aria-live="polite" data-pass={passes}>
          {passes ? 'Pass' : 'Blocked'} · {probe.map(n => n.toFixed(2)).join(', ')}
        </output>
        {target && <button type="button" onClick={() => setProbe(target)}>Sample target</button>}
      </fieldset>
    </div>
    <svg className={s.aperture} role="img" aria-label="Sampled legal crossing region" viewBox={`${-a-.25} ${-b-.25} ${2*a+.5} ${2*b+.5}`}>
      <polygon points={sectionOutline} fill="#101927" stroke="#516e8e" strokeWidth=".025" />
      <path d={sampled} fill="#31748a" />
      {target && <circle cx={target[0]} cy={-target[1]} r=".13" fill="none" stroke="#d1f1ff" strokeWidth=".035" />}
      <circle cx={probe[0]} cy={-probe[1]} r=".075" fill={passes ? '#9df6ce' : '#ffaa9d'} />
    </svg>
  </section>;
}

export default function GateLab({ volume }: { volume: VolumeId }) {
  const [params, setParams] = useSearchParams();
  const [choices, setChoices] = useState<Partial<Record<GateKind, number>>>({});
  const [angle, setAngle] = useState(0);
  const [close, setClose] = useState(false);
  const { root, model, status } = useSpecimens('gates', volume);
  const gates: readonly GateKind[] = gateFamilies[volume];
  const selected = gates.find(kind => kind === params.get('gate')) ?? gates[0];
  const selectedOpen = params.get('open');
  const selectedAxis = params.get('axis');
  const requested = selectedOpen?.trim() ? gateOpeningAt(selected, Number(selectedOpen), Number(selectedAxis ?? '0')) : undefined;
  const settings = gates.map(kind => {
    const variants = gateOpenings(kind);
    if (kind === selected && requested) {
      const index = variants.findIndex(item => item.open === requested.open && item.axis === requested.axis);
      if (index === -1) return { kind, variants: [...variants, requested], choice: variants.length, variant: requested };
      return { kind, variants, choice: index, variant: requested };
    }
    const choice = choices[kind] ?? 0;
    return { kind, variants, choice, variant: variants[choice] };
  });
  const active = settings.find(item => item.kind === selected)!.variant;

  useEffect(() => { if (status === 'ready') model.current?.drawGates(angle, close); }, [angle, close, choices, model, selected, selectedOpen, selectedAxis, status]);

  function select(kind: GateKind, variant: Variant, index: number) {
    setChoices(previous => ({ ...previous, [kind]: index < gateOpenings(kind).length ? index : 0 }));
    const next = new URLSearchParams(params);
    next.set('gate', kind);
    next.set('open', String(variant.open));
    next.set('axis', String(variant.axis));
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return <section ref={root} id={`gates-${volume}`} aria-label={`${volume.toUpperCase()} gate specimens`} className={s.preview}>
    <div id="gates" className={s.specimenGrid}>
      {settings.map(({ kind, variants, choice, variant }) => {
        const { label, note } = gateDescription(kind);
        return <figure key={kind} className={s.specimen}>
          <SpecimenCanvas id={kind} label={`${label} gate`} open={variant.open} axis={variant.axis} />
          <figcaption className={s.specimenCaption}>
            <h2>{label}</h2><p>{note}</p>
            {(variants.length > 1 && gateOpenings(kind).length > 1) && <label>{label} opening
              <select value={kind === 'daybreak-crystal' ? variant.open : choice} onChange={e => {
                const index = Number(e.currentTarget.value) + (kind === 'daybreak-crystal' ? 1 : 0);
                select(kind, variants[index], index);
              }}>
                {variants.map((item, i) => <option key={i} value={kind === 'daybreak-crystal' ? item.open : i}>{item.label}</option>)}
              </select>
            </label>}
            <button type="button" aria-pressed={selected === kind} onClick={() => select(kind, variant, choice)}>Inspect {label}</button>
          </figcaption>
        </figure>;
      })}
    </div>
    <SpecimenStatus status={status} />
    <fieldset className={s.group}>
      <legend>Specimen view</legend>
      <label>{volume.toUpperCase()} specimen angle
        <input type="range" aria-label={`${volume.toUpperCase()} specimen angle`} min="-80" max="80" value={angle}
          disabled={status !== 'ready'} onChange={e => setAngle(e.currentTarget.valueAsNumber)} /><output>{angle}°</output>
      </label>
      {volume === 'orbit' && <label>ORBIT specimen framing
        <select value={close ? 'close' : 'full'} disabled={status !== 'ready'} onChange={e => setClose(e.currentTarget.value === 'close')}>
          <option value="full">Full gate</option><option value="close">Close surface and throat</option>
        </select>
      </label>}
      <button type="button" onClick={() => setAngle(0)}>Front view</button>
      <button type="button" onClick={() => {
        setAngle(0);
        setClose(false);
        setChoices({});
        const next = new URLSearchParams(params);
        ['gate', 'open', 'axis'].forEach(key => next.delete(key));
        setParams(next, { replace: true, preventScrollReset: true });
      }}>Reset specimens</button>
    </fieldset>
    <Aperture key={`${selected}:${active.open}:${active.axis}`} kind={selected} variant={active} />
  </section>;
}
