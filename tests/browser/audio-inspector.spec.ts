import { expect, test } from '@playwright/test';

const waveformsReadyTimeout = 90_000;

test('STARWAKE Inspector uses the complete official master and seven sections with seek, pause and resume', async ({ page }, run) => {
  test.setTimeout(360_000);
  await page.goto('/debug/audio/?vol=orbit');
  await expect(page.getByRole('heading', { name: 'ORBIT — STARWAKE' })).toBeVisible();
  await expect(page.getByText('384 beats', { exact: true })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Music sections' });
  expect(await sections.getByRole('button').allTextContents()).toEqual(
    ['OUTER BELT', 'DRIFT', 'RINGBREAK', 'MAELSTROM', 'ECLIPSE', 'AURORA', 'APHELION']);
  await expect(page.getByText('Waveforms ready')).toBeVisible({ timeout: 300_000 });
  await sections.getByRole('button', { name: 'AURORA', exact: true }).click();
  const position = page.getByLabel('Playback position');
  await expect(position).toHaveText('02:00.00');
  await page.getByRole('button', { name: 'Play all' }).click();
  await expect(position).not.toHaveText('02:00.00');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.waitForTimeout(150);
  const held = await position.textContent();
  await page.waitForTimeout(150);
  await expect(position).toHaveText(held!);
  await page.getByRole('button', { name: 'Play Master' }).click();
  await expect(position).not.toHaveText(held!);
  await page.screenshot({ path: run.outputPath('starwake-inspector.png') });
});

test('CONTROL shares the production master, preserves the release and skips elapsed attacks', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/?audio-inspector');
  await page.waitForFunction(() => typeof window.inspectControlRouting === 'function');
  const result = await page.evaluate(() => window.inspectControlRouting());
  expect(result.mix.rms).toBeLessThan(.00003);
  expect(result.tail.rms).toBeGreaterThan(.01);
  expect(result.tailEnd.rms).toBeLessThan(.00005);
  expect(result.upcoming.rms).toBeGreaterThan(.01);
  expect(result.elapsed.peak).toBe(0);
});

test('DESCENT routes to CONTROL with authored sections, a rendered waveform and working seek and resume', async ({ page }) => {
  test.setTimeout(waveformsReadyTimeout + 30_000);
  await page.goto('/debug/?vol=descent#audio');
  await page.getByRole('link', { name: 'DESCENT — CONTROL' }).click();
  await expect(page).toHaveURL(/\/debug\/audio\/\?vol=descent$/);
  await expect(page.getByText('136 BPM', { exact: true })).toBeVisible();
  await expect(page.getByText('384 beats', { exact: true })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Music sections' });
  expect(await sections.getByRole('button').allTextContents()).toEqual(
    ['ORDER', 'LOCK', 'FLIGHT', 'PRESSURE', 'HOLD', 'LOCKDOWN', 'BREACH']);
  await expect(page.getByText('Waveforms ready')).toBeVisible({ timeout: waveformsReadyTimeout });
  const position = page.getByLabel('Playback position');
  await sections.getByRole('button', { name: 'HOLD' }).click();
  await expect(position).toHaveText('01:52.94');
  await page.getByRole('button', { name: 'Play all' }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await expect(position).not.toHaveText('01:52.94');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await sections.getByRole('button', { name: 'LOCKDOWN' }).click();
  await expect(position).toHaveText('02:07.05');
  await page.getByRole('button', { name: 'Play Master' }).click();
  await expect(page.getByText('Playing · Master')).toBeVisible();
  await expect(position).not.toHaveText('02:07.05');
});

test('DAYBREAK stems null against the production mix and isolate sound and reverb', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:8090/?audio-inspector');
  await page.waitForFunction(() => typeof window.inspectAudioRouting === 'function');
  const result = await page.evaluate(() => window.inspectAudioRouting());
  await info.attach('PCM measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.official.rms).toBeGreaterThan(.02);
  expect(result.mix.peak).toBeLessThan(.0001);
  expect(result.mix.relative).toBeLessThan(.0001);
  expect(result.master.peak).toBeLessThan(.0001);
  expect(result.isolated.peak).toBeLessThan(.0001);
  expect(result.isolated.relative).toBeLessThan(.0001);
  expect(result.muted.peak).toBe(0);
  expect(result.gain.peak).toBeLessThan(.0001);
  expect(result.gain.relative).toBeLessThan(.0001);
  expect(result.kick.rms).toBeGreaterThan(.02);
});

test('DAYBREAK cueing respects delayed drum onsets and OUTRO ends without the isolated Kick', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:8090/?audio-inspector');
  await page.waitForFunction(() => typeof window.inspectDrumCues === 'function');
  const result = await page.evaluate(() => window.inspectDrumCues());
  await info.attach('Drum cue measurements', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.upcomingSnare.rms).toBeGreaterThan(.001);
  expect(result.pastSnare.peak).toBe(0);
  expect(result.precedingKick.peak).toBeGreaterThan(.05);
  expect(result.finalBar.peak).toBeLessThan(.00001);
});

test('real waveforms, cueing and playback share one synchronized timeline and one live context', async ({ page }, info) => {
  test.setTimeout(waveformsReadyTimeout + 30_000);
  await page.addInitScript(() => {
    const stats = { created: 0, closed: 0, peak: 0, offlineActive: 0, offlinePeak: 0, offlineFrames: 0, offlineMs: 0 };
    Object.assign(window, { audioInspectorStats: stats });
    const Native = window.AudioContext;
    const Offline = window.OfflineAudioContext;
    window.AudioContext = class extends Native {
      constructor() {
        super();
        stats.created++;
        const meter = this.createAnalyser();
        const data = new Float32Array(meter.fftSize);
        const connect = GainNode.prototype.connect;
        const observe = () => {
          if (this.state === 'closed') return;
          meter.getFloatTimeDomainData(data);
          for (const sample of data) stats.peak = Math.max(stats.peak, Math.abs(sample));
          requestAnimationFrame(observe);
        };
        const destination = this.destination;
        const prototype = GainNode.prototype;
        prototype.connect = function (this: GainNode, ...args: unknown[]) {
          if (args[0] === destination) Reflect.apply(connect, this, [meter]);
          return Reflect.apply(connect, this, args);
        } as typeof connect;
        void requestAnimationFrame(observe);
        this.addEventListener('statechange', () => {
          if (this.state === 'closed') {
            stats.closed++;
            prototype.connect = connect;
          }
        });
      }
    };
    window.OfflineAudioContext = class extends Offline {
      async startRendering() {
        const started = performance.now();
        stats.offlinePeak = Math.max(stats.offlinePeak, ++stats.offlineActive);
        stats.offlineFrames = Math.max(stats.offlineFrames, this.length * this.destination.channelCount);
        try { return await super.startRendering(); }
        finally { stats.offlineActive--; stats.offlineMs += performance.now() - started; }
      }
    };
  });
  const readStats = () => page.evaluate(() => (window as unknown as { audioInspectorStats: {
    created: number; closed: number; peak: number; offlinePeak: number; offlineActive: number; offlineFrames: number;
  } }).audioInspectorStats);
  const started = Date.now();
  await page.goto('/debug/audio');
  await expect(page).toHaveURL(/\/debug\/audio\/$/);
  await expect(page.getByRole('heading', { name: 'DAYBREAK' })).toBeVisible();
  await expect(page.getByText('120 BPM', { exact: true })).toBeVisible();
  await expect(page.getByText('288 beats', { exact: true })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('inspector-test', 'unchanged'));
  const storage = () => page.evaluate(() => JSON.stringify(localStorage));
  const previous = await storage();

  const time = page.getByLabel('Playback position');
  const ruler = page.getByRole('slider', { name: 'Timeline position' });
  const cue = page.getByRole('slider', { name: 'Kick cue' });
  const playAll = page.getByRole('button', { name: 'Play all' });
  const canvas = page.getByRole('img', { name: /waveform/ });
  const gain = page.getByRole('slider', { name: 'Kick gain' });
  await expect(gain).toHaveValue('1');
  await expect(page.getByRole('slider', { name: / cue$/ })).toHaveCount(7);
  await expect(page.getByRole('slider', { name: 'Bass cue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'SUNBURST' }).click();
  await expect(time).toHaveText('01:20.00');
  await expect(page.getByRole('button', { name: 'SUNBURST' })).toHaveAttribute('aria-current', 'true');
  await playAll.click();
  await expect.poll(async () => (await readStats()).peak).toBeGreaterThan(.04);
  await expect.poll(async () => Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(80.1);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const paused = Number(await ruler.getAttribute('aria-valuenow'));
  expect(paused).toBeGreaterThan(80);
  await expect(time).not.toHaveText('00:00.00');
  await playAll.click();
  await expect.poll(async () => Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(paused + .05);
  await page.getByRole('button', { name: 'LIFT' }).click();
  await expect.poll(async () => Number(await ruler.getAttribute('aria-valuenow'))).toBeLessThan(41);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(40);
  await page.getByRole('button', { name: 'Return to start' }).click();
  await expect(time).toHaveText('00:00.00');

  const bounds = (await cue.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .48, bounds.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .56, bounds.y + 10, { steps: 5 });
  await page.mouse.up();
  const kickTime = Number(await cue.getAttribute('aria-valuenow'));
  expect(kickTime).toBeCloseTo(81.76, 0);
  await expect(time).toHaveText('00:00.00');
  await page.getByRole('button', { name: 'Play Kick' }).click();
  await expect(page.getByText('Playing · Kick')).toBeVisible();
  await expect.poll(async () => Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(kickTime);
  await page.getByRole('button', { name: 'Play Snare' }).click();
  await expect(page.getByText('Playing · Snare')).toBeVisible();
  await page.getByRole('button', { name: 'Pause Snare' }).click();
  await page.getByRole('button', { name: 'Solo Kick' }).click();
  await page.getByRole('button', { name: 'Mute Kick' }).click();
  await expect(page.getByRole('button', { name: 'Solo Kick' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mute Kick' })).toHaveAttribute('aria-pressed', 'true');
  await gain.fill('0.5');
  const mixTime = await time.textContent();
  await page.getByRole('button', { name: 'Reset mix' }).click();
  await expect(gain).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Solo Kick' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Mute Kick' })).toHaveAttribute('aria-pressed', 'false');
  await expect(time).toHaveText(mixTime!);

  await expect(canvas).toHaveCount(7, { timeout: 40_000 });
  await expect(page.getByText('Waveforms ready')).toBeVisible({ timeout: waveformsReadyTimeout });
  const measured = await canvas.evaluateAll(items => items.map(item => {
    const wave = item as HTMLCanvasElement;
    const pixels = wave.getContext('2d')!.getImageData(0, 0, wave.width, wave.height).data;
    let columns = 0;
    for (let x = 0; x < wave.width; x++) {
      for (let y = 0; y < wave.height; y++) if (pixels[(y * wave.width + x) * 4 + 3]) { columns++; break; }
    }
    return columns;
  }));
  expect(measured.every(count => count > 10)).toBe(true);
  expect(new Set(measured).size).toBeGreaterThan(3);
  await test.step('zoom, scroll and scrub the visible ruler', async () => {
    const view = page.getByLabel('Timeline scroll area');
    for (const name of ['2×', '4×', 'Fit']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await view.evaluate(node => node.scrollWidth / node.clientWidth)).toBeCloseTo(name === 'Fit' ? 1 : Number(name[0]), 1);
    }
    await page.getByRole('button', { name: '4×', exact: true }).click();
    await page.getByRole('button', { name: 'RETURN', exact: true }).click();
    const alignment = await view.evaluate(node => {
      const [timeline] = node.children;
      const lanes = [...timeline.querySelectorAll('[role=slider]')].map(item => item.getBoundingClientRect());
      const playhead = timeline.querySelector('[data-playhead]')!.getBoundingClientRect();
      return { aligned: lanes.every(lane => lane.x === lanes[0].x && lane.width === lanes[0].width),
        full: playhead.y === lanes[0].y && playhead.bottom === lanes.at(-1)!.bottom,
        visible: playhead.x >= node.getBoundingClientRect().x, scroll: node.scrollLeft,
        target: playhead.x + 30, x: playhead.x, y: playhead.y + 32 };
    });
    expect(alignment).toMatchObject({ aligned: true, full: true, visible: true });
    expect(alignment.scroll).toBeGreaterThan(0);
    await page.mouse.move(alignment.x, alignment.y);
    await page.mouse.down();
    await page.mouse.move(alignment.target, alignment.y, { steps: 4 });
    await page.mouse.up();
    expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(112);
  });

  expect(await storage()).toBe(previous);
  await playAll.click();
  const stats = await readStats();
  expect(stats).toMatchObject({ created: 1, closed: 0, offlinePeak: 1, offlineActive: 0 });
  expect(stats.offlineFrames).toBeLessThanOrEqual(14 * 22050 * 16);
  await page.getByRole('link', { name: 'SoFarAway' }).click();
  await expect(page).toHaveURL(/\/debug\/$/);
  await expect.poll(async () => (await readStats()).closed).toBe(1);
  await info.attach('Playback and resources', { body: JSON.stringify({ ...stats, testElapsedMs: Date.now() - started }), contentType: 'application/json' });
});

test('responsive layouts, high-DPI canvas, direct refresh and four multitrack volumes', async ({ browser }, info) => {
  test.setTimeout(600_000);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8089/debug/audio/');
  const canvas = page.getByRole('img', { name: 'Master waveform' });
  await expect(canvas).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText('Waveforms ready')).toBeVisible({ timeout: waveformsReadyTimeout });
  for (const [width, height] of [[1920, 1080], [1280, 720], [960, 540], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => canvas.evaluate(item => {
      const wave = item as HTMLCanvasElement;
      return Math.abs(wave.width - wave.clientWidth * devicePixelRatio);
    })).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const track = (await page.getByRole('button', { name: 'Play Atmos' }).boundingBox())!;
    expect(track.y + track.height).toBeLessThan(height + 1);
    const wave = (await canvas.boundingBox())!;
    expect(wave.x).toBeGreaterThan(track.x + track.width);
    const file = info.outputPath(`audio-inspector-${width}x${height}.png`);
    await page.screenshot({ path: file });
    await info.attach(`${width}×${height} at DPR 2`, { path: file, contentType: 'image/png' });
  }
  await page.setViewportSize({ width:960,height:760 });
  for (const volume of ['elsewhere', 'descent']) {
    await page.getByRole('combobox', { name: 'Volume' }).selectOption(volume);
    await expect(page.getByRole('heading', { name: volume.toUpperCase() })).toBeVisible();
    await expect(page.getByRole('slider', { name: / cue$/ })).toHaveCount(volume === 'elsewhere' ? 8 : 9);
    await expect(page.getByText('Waveforms ready')).toBeVisible({timeout:180_000});
    await expect(page.getByRole('img',{name:/waveform/})).toHaveCount(volume === 'elsewhere'?8:9);
    await page.screenshot({path:info.outputPath(volume+'-stems-960.png')});
  }
  await page.getByRole('combobox', { name: 'Volume' }).selectOption('orbit');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ORBIT — STARWAKE' })).toBeVisible();
  await expect(page.getByText('128 BPM', { exact: true })).toBeVisible();
  await expect(page.getByText('384 beats', { exact: true })).toBeVisible();
  await expect(page.getByText('Waveforms ready')).toBeVisible({timeout:300_000});
  await expect(page.getByRole('img',{name:/waveform/})).toHaveCount(8);
  await page.screenshot({path:info.outputPath('orbit-stems-960.png')});
  await expect(canvas).toHaveCount(1);
  await page.getByRole('button', { name: 'Play all' }).click();
  await expect(page.getByText('Playing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await context.close();
});


for (const [volume, count] of [['elsewhere',7],['daybreak',6],['descent',8],['orbit',7]] as const) {
  test(`${volume} real stems preserve the master, isolate effects and respond to mute and gain`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.goto('http://127.0.0.1:8090/?audio-inspector');
    await page.waitForFunction(() => typeof window.inspectVolumeStems === 'function');
    const result = await page.evaluate(id => window.inspectVolumeStems(id), volume);
    await info.attach('Stem PCM measurements', { body: JSON.stringify(result,null,2), contentType:'application/json' });
    expect(result.tracks.length).toBe(count + 1);
    for (const track of result.tracks) expect(track.rms, track.stem).toBeGreaterThan(.00005);
    expect(new Set(result.tracks.map(track => track.rms.toFixed(5))).size).toBe(count + 1);
    expect(result.master.rms).toBeLessThan(.00003);
    expect(result.master.relative).toBeLessThan(.0005);
    expect(result.reset.rms).toBeLessThan(.00003);
    expect(result.allMuted.peak).toBe(0);
    for (const stem of result.isolated) {
      expect(stem.audible.rms, stem.stem).toBeGreaterThan(.00005);
      expect(stem.solo.rms, stem.stem).toBeLessThan(.00003);
      expect(stem.mute.peak, stem.stem).toBe(0);
      expect(stem.zero.peak, stem.stem).toBe(0);
      expect(stem.quiet.rms, stem.stem).toBeLessThan(stem.audible.rms * .8);
      expect(stem.quiet.rms, stem.stem).toBeGreaterThan(stem.audible.rms * .35);
    }
  });
}
