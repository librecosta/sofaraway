import { useEffect, useState, useSyncExternalStore } from 'react';
import { safeAreaEdges } from '../platform';
import type { ToyContainerState } from '../platform';
import { installDevPlatform } from './bridge';
import { MockToyPlatform } from './mock-platform';
import type { DevicePreset } from './mock-platform';
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
  const controls = useSyncExternalStore(platform.subscribe, platform.getControls);
  const state = controls.available ? controls.container : null;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const remove = installDevPlatform(platform);
    setReady(true);
    return remove;
  }, [platform]);

  return <main className="toy-development" data-toy-dev-console>
    <aside>
      <h1>Toy Dev Console</h1>
      <p>Offline container simulator</p>
      <label><input type="checkbox" checked={!state}
        onChange={event => platform.setAvailable(!event.target.checked)} /> SDK unavailable</label>
      <fieldset disabled={!state}>
        <legend>Container</legend>
        <label>Device <select value={controls.preset}
          onChange={event => platform.chooseDevice(event.target.value as DevicePreset)}>
          <option value="desktop">Desktop</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select></label>
        <label>Orientation <select value={state?.orientation ?? 'landscape'}
          onChange={event => platform.setMode({ orientation: event.target.value as ToyContainerState['orientation'],
            immersive: state?.immersive ?? false })}>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
        </select></label>
        <label><input type="checkbox" checked={state?.immersive ?? false}
          onChange={event => platform.updateContainer({ immersive: event.target.checked })} /> Immersive</label>
        <NumberField label="Width" min={240} max={1920} value={state?.width}
          change={width => platform.updateContainer({ width })} />
        <NumberField label="Height" min={240} max={1920} value={state?.height}
          change={height => platform.updateContainer({ height })} />
        {safeAreaEdges.map(edge => <NumberField key={edge} label={`Safe area ${edge}`} min={0} max={120}
          value={state?.safeArea[edge]} change={value => {
            if (state) platform.updateContainer({ safeArea: { ...state.safeArea, [edge]: value } });
          }} />)}
        <NumberField label="Capsule width" min={0} max={320} value={controls.capsuleWidth}
          change={capsuleWidth => platform.update({ capsuleWidth })} />
        <NumberField label="Capsule height" min={0} max={120} value={controls.capsuleHeight}
          change={capsuleHeight => platform.update({ capsuleHeight })} />
        <NumberField label="Bottom bar height" min={0} max={120} value={controls.bottomBar}
          change={bottomBar => platform.update({ bottomBar })} />
        <NumberField label="Request delay (ms)" min={0} max={6000} value={controls.requestDelay}
          change={requestDelay => platform.update({ requestDelay })} />
        <label>Mode response <select value={controls.outcome} onChange={event =>
          platform.update({ outcome: event.target.value as typeof controls.outcome })}>
          <option value="accept">Accept</option><option value="reject">Reject</option><option value="timeout">Timeout</option>
        </select></label>
      </fieldset>
      <div role="group" aria-label="Container lifecycle">
        <button type="button" disabled={controls.lifecycle !== 'active'} onClick={() => platform.setLifecycle('suspended')}>Suspend</button>
        <button type="button" disabled={controls.lifecycle !== 'suspended'} onClick={() => platform.setLifecycle('active')}>Resume</button>
        <button type="button" disabled={controls.lifecycle === 'closed'} onClick={() => platform.setLifecycle('closed')}>Close container</button>
      </div>
      <ol aria-label="Container log">{controls.log.map((entry, index) => <li key={index}>{entry}</li>)}</ol>
      <button type="button" onClick={() => platform.reset()}>Reset simulation</button>
      <p role="status">{state ? `${state.width} × ${state.height} CSS px` : 'SDK unavailable. Browser viewport and safe-area defaults.'}</p>
    </aside>
    <section className={state?.immersive ? 'toy-container immersive' : 'toy-container'} aria-label="Simulated container">
      <div className="toy-frame" style={state ? { width: state.width, height: state.height } : undefined}>
        {ready && <iframe src="./index.html" title="SoFarAway Toy" allowFullScreen />}
        {state && controls.capsuleWidth > 0 && controls.capsuleHeight > 0 &&
          <div className="host-capsule" aria-hidden="true" style={{ width: controls.capsuleWidth, height: controls.capsuleHeight }}>Capsule</div>}
        {state && controls.bottomBar > 0 &&
          <div className="host-bottom-bar" aria-hidden="true" style={{ height: controls.bottomBar }}>Interaction bar</div>}
      </div>
    </section>
  </main>;
}
