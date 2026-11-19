import { expect, test } from '@playwright/test';

test('STARWAKE production scheduling matches its continuous voice graph and disposes future sources', async ({ page }) => {
  await page.route('**/orbit-audio-check', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Audio check</title>' }));
  await page.goto('http://127.0.0.1:8091/orbit-audio-check');
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { OrbitSynthesizer, starwakeMaster } = await load('/app/game/audio/orbit.client.ts');
    const { OrbitVoices } = await load('/app/game/audio/orbit-voices.client.ts');
    const { starwakeTrack, starwakeEvents, beatSeconds, seed, step } = await load('/app/game/core/orbit-score.ts');
    const { encodeStarwakeWav, renderStarwake } = await load('/app/game/audio/orbit-export.client.ts');
    const rate = 44100, start = 120, end = 127.5;
    const render = async (direct: boolean) => {
      const ctx = new OfflineAudioContext(2, (end - start + starwakeTrack.tail) * rate, rate);
      const synth = direct
        ? new OrbitVoices(ctx, ctx.destination, 'B', starwakeEvents, { ...starwakeTrack, beatSeconds, seed }, starwakeMaster)
        : new OrbitSynthesizer(ctx, ctx.destination);
      if (direct) {
        for (const event of starwakeEvents) if (event.voice === 'kick' && event.at >= start && event.at < end) synth.duckAt(event.at - start);
        synth.schedule(-start, start - 1e-9, end); synth.finish(end - start - 180);
      }
      else {
        for (let i = start / step; i < end / step; i++) synth.scheduleStep(i, -start, start - 1e-9, end);
        synth.finishAt(end - start);
      }
      const audio = await ctx.startRendering();
      synth.dispose();
      return audio;
    };
    const direct = await render(true), scheduled = await render(false);
    let power = 0, peak = 0, signal = 0;
    for (let channel = 0; channel < 2; channel++) {
      const a = direct.getChannelData(channel), b = scheduled.getChannelData(channel);
      for (let i = 0; i < a.length; i++) {
        const delta = a[i] - b[i];
        peak = Math.max(peak, Math.abs(delta)); power += delta * delta; signal += a[i] * a[i];
      }
    }
    const encoded = encodeStarwakeWav(scheduled);
    const bytes = await encoded.blob.arrayBuffer();
    const decoded = await new OfflineAudioContext(2, 1, rate).decodeAudioData(bytes);
    const silentContext = new OfflineAudioContext(2, rate, rate);
    const stopped = new OrbitSynthesizer(silentContext, silentContext.destination);
    stopped.scheduleStep(Math.floor(start / step), -start);
    const voice = Reflect.get(stopped, 'voices');
    const ownedBefore = Reflect.get(voice, 'sources').size;
    stopped.dispose(); stopped.dispose();
    stopped.scheduleStep(Math.floor(start / step) + 2, -start);
    const ownedAfter = Reflect.get(voice, 'sources').size;
    const silent = await silentContext.startRendering();
    const stoppedPeak = Math.max(...silent.getChannelData(0).map(Math.abs));
    const controller = new AbortController(); controller.abort();
    let aborted = false;
    try { await renderStarwake(controller.signal); } catch (error) { aborted = (error as DOMException).name === 'AbortError'; }
    const invalid = new AudioBuffer({ length: 100, sampleRate: rate, numberOfChannels: 2 });
    let rejectsClipping = false, rejectsNonFinite = false;
    invalid.getChannelData(0)[0] = 1;
    try { encodeStarwakeWav(invalid); } catch { rejectsClipping = true; }
    invalid.getChannelData(0)[0] = NaN;
    try { encodeStarwakeWav(invalid); } catch { rejectsNonFinite = true; }
    return { rmsDelta: Math.sqrt(power / (direct.length * 2)), peakDelta: peak,
      rms: Math.sqrt(signal / (direct.length * 2)), ownedBefore, ownedAfter, stoppedPeak,
      decoded: [decoded.duration, decoded.sampleRate, decoded.numberOfChannels],
      aborted, rejectsClipping, rejectsNonFinite };
  });
  expect(result.rmsDelta).toBeLessThan(.00003);
  expect(result.peakDelta).toBeLessThan(.001);
  expect(result.rms).toBeGreaterThan(.04);
  expect(result.ownedBefore).toBeGreaterThan(0);
  expect(result.ownedAfter).toBe(0);
  expect(result.stoppedPeak).toBe(0);
  expect(result.decoded).toEqual([11.5, 44100, 2]);
  expect(result.aborted && result.rejectsClipping && result.rejectsNonFinite).toBe(true);
});
