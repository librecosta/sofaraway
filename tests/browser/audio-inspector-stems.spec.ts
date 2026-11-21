import { expect, test } from '@playwright/test';

// Inspect actual realtime output while routing changes, not just button state.
test('four-volume live mixing, interruption, switching and cleanup', async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    const Native = AudioContext;
    const state = { contexts: [] as AudioContext[], peak: 0, rms: 0, sources: 0, live: 0, maxLive: 0 };
    Object.assign(window, { stemLive: state });
    window.AudioContext = class extends Native {
      constructor() {
        super(); state.contexts.push(this);
        const meter = this.createAnalyser(); meter.fftSize = 2048;
        const data = new Float32Array(meter.fftSize), connect = GainNode.prototype.connect;
        const destination = this.destination;
        const observe = () => {
          if (this.state === 'closed') return;
          meter.getFloatTimeDomainData(data);
          let power = 0; for (const value of data) { power += value * value; state.peak = Math.max(state.peak, Math.abs(value)); }
          state.rms = Math.sqrt(power / data.length); requestAnimationFrame(observe);
        };
        GainNode.prototype.connect = function (this: GainNode, ...args: unknown[]) {
          if (args[0] === destination) Reflect.apply(connect, this, [meter]);
          return Reflect.apply(connect, this, args);
        } as typeof connect;
        for (const method of ['createOscillator','createBufferSource'] as const) {
          const create = this[method].bind(this);
          Object.assign(this, { [method]: () => {
            const source = create(); state.sources++; state.live++; state.maxLive = Math.max(state.maxLive,state.live);
            let retired = false;
            const retire = () => { if (!retired) { retired = true; state.live--; } };
            const stop = source.stop.bind(source);
            source.stop = (at?: number) => { stop(at); if (at === undefined || at <= this.currentTime) retire(); };
            source.addEventListener('ended', retire, { once:true }); return source;
          } });
        }
        requestAnimationFrame(observe);
      }
    };
  });
  const rms = () => page.evaluate(() => (window as any).stemLive.rms as number);
  await page.goto('/debug/audio/?vol=elsewhere');
  const cases = [
    ['elsewhere','DROP','Bass'], ['daybreak','SUNBURST','Keys'], ['descent','LOCKDOWN','Chord'], ['orbit','AURORA','Pad'],
  ];
  for (const [id,section,stem] of cases) {
    await page.getByRole('combobox', { name:'Volume', exact:true }).selectOption(id);
    await page.getByRole('button', {name:section,exact:true}).click();
    await page.getByRole('button', {name:`Play ${stem}`,exact:true}).click();
    await expect.poll(rms,{timeout:8_000}).toBeGreaterThan(.001);
    const initial = await page.getByRole('slider',{name:'Timeline position'}).getAttribute('aria-valuenow');
    await page.getByRole('button',{name:`Mute ${stem}`,exact:true}).click();
    await expect.poll(rms).toBeLessThan(.00001);
    await page.getByRole('button',{name:`Mute ${stem}`,exact:true}).click();
    await expect.poll(rms).toBeGreaterThan(.001);
    await page.getByRole('slider',{name:`${stem} gain`}).fill('0');
    await expect.poll(rms).toBeLessThan(.00001);
    await page.getByRole('button',{name:'Reset mix',exact:true}).click();
    await page.getByRole('button',{name:`Solo ${stem}`,exact:true}).click();
    await expect.poll(rms).toBeGreaterThan(.001);
    expect(Number(await page.getByRole('slider',{name:'Timeline position'}).getAttribute('aria-valuenow'))).toBeGreaterThan(Number(initial));
    await page.evaluate(async () => { const contexts = (window as any).stemLive.contexts as AudioContext[]; await contexts.at(-1)!.suspend(); });
    await expect(page.getByText('Paused',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Play all',exact:true}).click();
    await expect.poll(rms).toBeGreaterThan(.001);
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await expect.poll(rms).toBeLessThan(.00001);
  }
  for (const id of ['daybreak','orbit','descent','elsewhere'])
    await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption(id);
  await page.getByRole('link',{name:'SoFarAway',exact:true}).click();
  await expect.poll(() => page.evaluate(() => (window as any).stemLive.contexts.every((ctx:AudioContext) => ctx.state==='closed'))).toBe(true);
  const measured = await page.evaluate(() => { const s=(window as any).stemLive; return { contexts:s.contexts.length, states:s.contexts.map((c:AudioContext)=>c.state),sources:s.sources,live:s.live,maxLive:s.maxLive,peak:s.peak }; });
  expect(measured.live).toBe(0);
  expect(measured.peak).toBeGreaterThan(.01);
  await info.attach('Live audio lifecycle',{body:JSON.stringify(measured,null,2),contentType:'application/json'});
});

for (const [id,stem] of [['elsewhere','arp'],['daybreak','keys'],['descent','signal'],['orbit','lead']] as const) {
  test(`${id} exports a complete real stem with tails, valid PCM and continuous chunk boundaries`, async ({ page }, info) => {
    test.setTimeout(300_000);
    await page.route('**/stem-export-check', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Stem WAV check</title>'}));
    await page.goto('http://127.0.0.1:8091/stem-export-check');
    const downloadPromise = page.waitForEvent('download', { timeout: 280_000 });
    const result = await page.evaluate(async ({id,stem}) => {
      const load = (path:string) => import(/* @vite-ignore */ path);
      const {volumeById} = await load('/app/game/core/volumes.ts');
      const {inspectorScore,defaultMix,inspectorPreroll} = await load('/app/game/debug/audio/track-adapter.ts');
      const {inspectorSource} = await load('/app/game/debug/audio/source.client.ts');
      const {exportStem} = await load('/app/game/debug/audio/stem-export.client.ts');
      const score = inspectorScore(volumeById(id));
      const exported = await exportStem(score,stem);
      const bytes = await exported.blob.arrayBuffer(), header = new DataView(bytes);
      const bits=header.getUint16(34,true),format=header.getUint16(20,true);
      const ctx = new OfflineAudioContext(2,1,44100), decoded = await ctx.decodeAudioData(bytes);
      let peak = 0,power = 0,tailPower = 0,invalid = 0;
      for(let ch=0;ch<2;ch++)for(let i=0;i<decoded.length;i++) {
        const value=decoded.getChannelData(ch)[i]; if(!Number.isFinite(value))invalid++;
        peak=Math.max(peak,Math.abs(value));power+=value*value;
        if(i>=score.duration*44100)tailPower+=value*value;
      }
      // Compare across a real block seam against a longer continuous graph.
      const seam = id==='orbit'?130:id==='descent'?130:id==='daybreak'?90:100;
      const start = seam-10-inspectorPreroll(score), end=seam+2, rate=44100;
      const referenceContext = new OfflineAudioContext(2,Math.ceil((end-start)*rate),rate);
      const source = inspectorSource(referenceContext,score,referenceContext.destination,defaultMix(),null,stem);
      const authored = id==='orbit'||id==='descent';
      for(let i=authored?Math.floor(start/score.step):Math.ceil(start/score.step);i<end/score.step;i++)
        source.playStep(i,authored?i*score.step-start:Math.max(0,i*score.step-start),start-1e-8);
      const reference = await referenceContext.startRendering(); source.dispose();
      let error=0,energy=0,n=0;
      for(let ch=0;ch<2;ch++)for(let i=Math.round((seam-.2)*rate);i<Math.round((seam+.2)*rate);i++){
        const expected=reference.getChannelData(ch)[i-Math.round(start*rate)]*exported.trim;
        const difference=decoded.getChannelData(ch)[i]-expected;error+=difference*difference;energy+=expected*expected;n++;
      }
      const link=document.createElement('a');link.href=URL.createObjectURL(exported.blob);link.download=exported.filename;link.click();
      return {filename:exported.filename,duration:decoded.duration,expected:score.length,rate:decoded.sampleRate,
        channels:decoded.numberOfChannels,bits,format,peak,
        rms:Math.sqrt(power/(decoded.length*2)),invalid,tailRms:Math.sqrt(tailPower/(score.tail*rate*2)),trim:exported.trim,
        seamRms:Math.sqrt(error/n),seamRelative:energy ? Math.sqrt(error/energy) : error ? Infinity : 0};
    },{id,stem});
    const download=await downloadPromise;
    await download.saveAs(info.outputPath(result.filename));
    await info.attach('Stem export and seam measurements',{body:JSON.stringify(result,null,2),contentType:'application/json'});
    expect(result.duration).toBeCloseTo(result.expected,4);
    expect([result.rate,result.channels,result.bits,result.format]).toEqual([44100,2,16,1]);
    expect(result.invalid).toBe(0);expect(result.peak).toBeGreaterThan(.01);expect(result.peak).toBeLessThan(1);
    expect(result.rms).toBeGreaterThan(.001);expect(result.tailRms).toBeGreaterThanOrEqual(0);
    expect(result.seamRms).toBeLessThan(.00005);
    expect(result.seamRelative).toBeLessThan(.005);
  });
}

test('selected-stem UI exports while playback remains available and cancels on volume change', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.goto('/debug/audio/?vol=descent');
  const exportButton = page.getByRole('button',{name:'Export selected stem WAV',exact:true});
  await page.getByRole('combobox',{name:'Selected stem',exact:true}).selectOption('chord');
  await exportButton.click();
  await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption('orbit');
  await expect(page.getByRole('combobox',{name:'Selected stem',exact:true})).toHaveValue('master');
  await expect(exportButton).toBeDisabled();
  await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption('descent');
  await page.getByRole('button',{name:'Play Signal',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Selected stem',exact:true})).toHaveValue('signal');
  const pending = page.waitForEvent('download',{timeout:220_000});
  await exportButton.click();
  await expect(page.getByText('Playing · Signal',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Play all',exact:true}).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('DESCENT-CONTROL-SIGNAL.wav');
  await download.saveAs(info.outputPath(download.suggestedFilename()));
  await expect(page.getByText(/Signal · 171.0 s · 44.1 kHz stereo/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Render to WAV',exact:true})).toBeEnabled();
});

test('a canceled queued stem export allocates no full-song PCM', async ({ page }) => {
  await page.route('**/stem-memory-check', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Stem memory check</title>'}));
  await page.goto('http://127.0.0.1:8091/stem-memory-check');
  const result = await page.evaluate(async () => {
    const load=(path:string)=>import(/* @vite-ignore */ path);
    const {inspectorOffline}=await load('/app/game/debug/audio/offline.client.ts');
    const {renderStem}=await load('/app/game/debug/audio/stem-export.client.ts');
    const {inspectorScore}=await load('/app/game/debug/audio/track-adapter.ts');
    const {volumeById}=await load('/app/game/core/volumes.ts');
    const Native=AudioBuffer; let allocated=0;
    window.AudioBuffer=class extends Native { constructor(options:AudioBufferOptions) { super(options);allocated++; } };
    let release!:()=>void;
    const occupied=inspectorOffline(undefined,()=>new Promise<void>(resolve=>{release=resolve;}));
    await Promise.resolve();
    const abort=new AbortController();
    const pending=renderStem(inspectorScore(volumeById('orbit')),'lead',abort.signal).catch((error:DOMException)=>error.name);
    abort.abort();release();await occupied;
    return { allocated, error:await pending };
  });
  expect(result).toEqual({ allocated:0,error:'AbortError' });
});
