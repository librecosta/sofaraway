import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { safeAreaEdges } from '../platform';
import type { ToyContainerState } from '../platform';
import { MockToyPlatform } from './mock-platform';
import './console.css';

function NumberField({ label, value, min, max, change }: {
  label: string; value?: number; min: number; max: number; change(value: number): void;
}) {
  return <label>{label}
    <input key={value} type="number" min={min} max={max} step="1" defaultValue={value}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      onBlur={event => {
        if (value === undefined) return;
        const input = event.currentTarget;
        const number = input.valueAsNumber;
        const next = Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : value;
        input.value = String(next);
        if (next !== value) change(next);
      }} />
  </label>;
}

export function DevConsole() {
  const [platform] = useState(() => new MockToyPlatform());
  const state = useSyncExternalStore(platform.subscribe, platform.getSnapshot);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const root = frame.current?.contentDocument?.documentElement;
    if (!loaded || !root) return;
    for (const edge of safeAreaEdges) {
      if (state) root.style.setProperty(`--safe-area-${edge}`, `${state.safeArea[edge]}px`);
      else root.style.removeProperty(`--safe-area-${edge}`);
    }
  }, [loaded, state]);

  return <main className="toy-development" data-toy-dev-console>
    <aside>
      <h1>Toy Dev Console</h1>
      <p>Offline container simulator</p>
      <label><input type="checkbox" checked={!state}
        onChange={event => platform.setAvailable(!event.target.checked)} /> SDK unavailable</label>
      <fieldset disabled={!state}>
        <legend>Container</legend>
        <label>Device <select value={state?.device ?? 'desktop'}
          onChange={event => platform.chooseDevice(event.target.value as ToyContainerState['device'])}>
          <option value="desktop">Desktop</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select></label>
        <label>Orientation <select value={state?.orientation ?? 'landscape'}
          onChange={event => platform.chooseOrientation(event.target.value as ToyContainerState['orientation'])}>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select></label>
        <label><input type="checkbox" checked={state?.immersive ?? false}
          onChange={event => platform.update({ immersive: event.target.checked })} /> Immersive</label>
        <NumberField label="Width" min={240} max={1920} value={state?.width}
          change={width => platform.update({ width })} />
        <NumberField label="Height" min={240} max={1920} value={state?.height}
          change={height => platform.update({ height })} />
        {safeAreaEdges.map(edge => <NumberField key={edge} label={`Safe area ${edge}`} min={0} max={120}
          value={state?.safeArea[edge]} change={value => {
            if (state) platform.update({ safeArea: { ...state.safeArea, [edge]: value } });
          }} />)}
      </fieldset>
      <button type="button" onClick={() => platform.reset()}>Reset simulation</button>
      <p role="status">{state ? `${state.width} × ${state.height} CSS px` : 'SDK unavailable. Browser viewport and safe-area defaults.'}</p>
    </aside>
    <section className={state?.immersive ? 'toy-container immersive' : 'toy-container'} aria-label="Simulated container">
      <iframe ref={frame} src="./index.html" title="SoFarAway Toy" allowFullScreen onLoad={() => setLoaded(true)}
        style={state ? { width: state.width, height: state.height } : undefined} />
    </section>
  </main>;
}
