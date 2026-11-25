import { expect, test } from '@playwright/test';

test('CONTROL offline blocks release their synthesizer on failure, abort and retry', async ({ page }) => {
  await page.goto('http://127.0.0.1:8091/debug/');
  const result = await page.evaluate(async () => {
    const synthModule = '/app/game/audio/descent.client.ts';
    const exportModule = '/app/game/audio/descent-export.client.ts';
    const { DescentSynthesizer }: typeof import('../../app/game/audio/descent.client') = await import(synthModule);
    const { renderDescent, encodeDescentWav }: typeof import('../../app/game/audio/descent-export.client') = await import(exportModule);
    const synth = DescentSynthesizer.prototype;
    const context = OfflineAudioContext.prototype;
    const { scheduleStep, finishAt, dispose } = synth;
    const startRendering = context.startRendering;
    const disposals = new Map<typeof synth, number>();
    synth.dispose = function () { disposals.set(this, (disposals.get(this) ?? 0) + 1); dispose.call(this); };

    const failures = [];
    for (const fault of ['schedule', 'finish', 'render', 'abort-before', 'abort-in-flight', 'copy']) {
      const abort = new AbortController();
      const fail = () => { throw new Error(fault); };
      if (fault === 'abort-before') abort.abort();
      if (fault === 'schedule') synth.scheduleStep = fail;
      if (fault === 'finish') synth.finishAt = fail;
      if (fault === 'render') context.startRendering = async () => fail();
      if (fault === 'abort-in-flight' || fault === 'copy') {
        context.startRendering = async function () {
          const rendering = startRendering.call(this);
          if (fault === 'abort-in-flight') abort.abort();
          const block = await rendering;
          if (fault === 'copy') block.getChannelData = fail;
          return block;
        };
      }
      try {
        // The in-flight cancellation must not allocate or render a second block.
        await renderDescent(undefined, fault === 'abort-in-flight' ? 20 : .55, abort.signal);
        throw new Error('Expected an injected export failure');
      } catch (error) {
        failures.push({ fault, reason: error instanceof DOMException ? error.name : (error as Error).message,
          disposals: [...disposals.values()] });
      } finally {
        synth.scheduleStep = scheduleStep;
        synth.finishAt = finishAt;
        context.startRendering = startRendering;
        disposals.clear();
      }
    }

    let format;
    for (let attempt = 0; attempt < 2; attempt++) {
      const buffer = await renderDescent(undefined, .55);
      const bytes = await encodeDescentWav(buffer).blob.arrayBuffer();
      const header = new DataView(bytes);
      format = [buffer.length, header.getUint16(22, true), header.getUint32(24, true), header.getUint16(34, true), bytes.byteLength];
    }
    return { failures, format, retryDisposals: [...disposals.values()] };
  });

  expect(result.failures).toEqual([
    { fault: 'schedule', reason: 'schedule', disposals: [1] },
    { fault: 'finish', reason: 'finish', disposals: [1] },
    { fault: 'render', reason: 'render', disposals: [1] },
    { fault: 'abort-before', reason: 'AbortError', disposals: [] },
    { fault: 'abort-in-flight', reason: 'AbortError', disposals: [1] },
    { fault: 'copy', reason: 'copy', disposals: [1] },
  ]);
  expect(result.retryDisposals).toEqual([1, 1]);
  const [frames, channels, rate, bits, length] = result.format!;
  expect([channels, rate, bits, length]).toEqual([2, 44100, 16, 44 + frames * 4]);
});
