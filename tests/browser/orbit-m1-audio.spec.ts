import { expect, test } from '@playwright/test';

test('F1 retains original Lead and Pad PCM outside five local quotations, including unchanged ECLIPSE', async ({page},info) => {
  test.setTimeout(240_000);
  await page.route('**/f1-reference', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Original voice comparison</title>'}));
  await page.goto('http://127.0.0.1:8091/f1-reference');
  const result = await page.evaluate(async () => {
    const load = (path:string) => import(/* @vite-ignore */path);
    const {inspectorScore,defaultMix} = await load('/app/game/debug/audio/track-adapter.ts');
    const {volumeById} = await load('/app/game/core/volumes.ts');
    const {inspectorSource} = await load('/app/game/debug/audio/source.client.ts');
    const rate=44100, volume=volumeById('orbit');
    const render = async (candidate:boolean,start:number,end:number,stem:string|null) => {
      const score=inspectorScore(volume,candidate?'m1':'original'),mix=defaultMix();
      mix.bass.muted=mix.pluck.muted=true;
      const ctx=new OfflineAudioContext(2,Math.round((end-start)*rate),rate);
      const synth=inspectorSource(ctx,score,ctx.destination,mix,null,stem);
      for(let i=Math.floor(start/score.step);i<Math.min(1536,Math.ceil(end/score.step));i++)
        synth.playStep(i,i*score.step-start,start-1e-8);
      synth.finishAt(180-start);
      const buffer=await ctx.startRendering();synth.dispose();return buffer;
    };
    const compare=(a:AudioBuffer,b:AudioBuffer,start:number,end:number)=>{
      let square=0,peak=0,reference=0;
      for(let ch=0;ch<2;ch++)for(let i=Math.round(start*rate);i<Math.round(end*rate);i++){
        const delta=a.getChannelData(ch)[i]-b.getChannelData(ch)[i];
        square+=delta*delta;peak=Math.max(peak,Math.abs(delta));reference+=a.getChannelData(ch)[i]**2;
      }
      return {rms:Math.sqrt(square/(2*(end-start)*rate)),peak,reference:Math.sqrt(reference/(2*(end-start)*rate))};
    };
    const original=await render(false,0,45,'lead'),candidate=await render(true,0,45,'lead');
    const leadUnchanged=compare(original,candidate,25,45);
    const additions=[compare(original,candidate,2,8),compare(original,candidate,18.5,22.5)];
    const pad=compare(await render(false,0,45,'pad'),await render(true,0,45,'pad'),0,45);
    const masters=[];
    for(const [start,end] of [[25,45],[45,75],[105,120],[120,150],[150,184]])
      masters.push({start,end,...compare(await render(false,start,end,null),await render(true,start,end,null),0,end-start)});
    return {leadUnchanged,additions,pad,masters};
  });
  await info.attach('F1 actual PCM against Original without Bass and Pluck',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.leadUnchanged.rms).toBeLessThan(.00003);
  expect(result.pad.rms).toBeLessThan(.00003);
  for(const addition of result.additions) expect(addition.rms).toBeGreaterThan(.002);
  for(const master of result.masters) expect(master.rms).toBeLessThan(.00003);
});

test('M1 Inspector and continuous candidate synthesis share real lead, pad, rhythm and effects', async ({page},info) => {
  test.setTimeout(180_000);
  await page.route('**/m1-audio-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>M1 routing</title>'}));
  await page.goto('http://127.0.0.1:8091/m1-audio-check');
  const result=await page.evaluate(async()=>{
    const load=(path:string)=>import(/* @vite-ignore */path);
    const {OrbitSynthesizer}=await load('/app/game/audio/orbit.client.ts');
    const {originalLeadArrangement}=await load('/app/game/audio/orbit-m1.client.ts');
    const {inspectorScore,defaultMix}=await load('/app/game/debug/audio/track-adapter.ts');
    const {volumeById}=await load('/app/game/core/volumes.ts');
    const {inspectorSource}=await load('/app/game/debug/audio/source.client.ts');
    const score=inspectorScore(volumeById('orbit'),'m1'),rate=44100;
    const rms=(audio:AudioBuffer)=>{
      let power=0,peak=0;for(let ch=0;ch<2;ch++)for(const sample of audio.getChannelData(ch)){
        if(!Number.isFinite(sample))throw new Error('Invalid PCM');power+=sample*sample;peak=Math.max(peak,Math.abs(sample));
      }return {rms:Math.sqrt(power/(audio.length*2)),peak};
    };
    const windows=[];
    for(const [start,end] of [[0,24],[105,132],[150,184]]){
      const render=async(inspector:boolean,stem:string|null=null,muted=false)=>{
        const ctx=new OfflineAudioContext(2,Math.round((end-start)*rate),rate), mix=defaultMix();
        if(stem&&muted)mix[stem].muted=true;
        const synth=inspector?inspectorSource(ctx,score,ctx.destination,mix,null,stem)
          :new OrbitSynthesizer(ctx,ctx.destination,undefined,originalLeadArrangement);
        for(let i=Math.floor(start/score.step);i<Math.min(1536,Math.ceil(end/score.step));i++)
          synth.playStep(i,i*score.step-start,start-1e-8);
        synth.finishAt(180-start);
        const buffer=await ctx.startRendering();synth.dispose();return buffer;
      };
      const direct=await render(false),inspector=await render(true);
      let error=0;for(let ch=0;ch<2;ch++)for(let i=0;i<direct.length;i++){
        const delta=direct.getChannelData(ch)[i]-inspector.getChannelData(ch)[i];error+=delta*delta;
      }
      const lead=rms(await render(true,'lead')),pad=rms(await render(true,'pad'));
      const muted=rms(await render(true,'pad',true));
      windows.push({start,end,master:rms(direct),residual:Math.sqrt(error/(direct.length*2)),lead,pad,muted});
    }
    return {tracks:score.tracks,windows};
  });
  await info.attach('M1 production-voice and Inspector PCM',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.tracks).toHaveLength(8);
  expect(result.tracks).not.toContain('bass');expect(result.tracks).not.toContain('pluck');
  for(const window of result.windows){
    expect(window.residual).toBeLessThan(.00003);
    expect(window.master.peak).toBeLessThan(1);
    expect(window.lead.rms).toBeGreaterThan(.005);expect(window.pad.rms).toBeGreaterThan(.003);
    expect(window.muted.peak).toBe(0);
  }
});

test('Original and M1 compare at the same section, show distinct real waveforms and export the candidate', async ({page},info)=>{
  test.setTimeout(900_000);
  await page.addInitScript(()=>{
    const Native=AudioContext,contexts:AudioContext[]=[];
    Object.assign(window,{m1Contexts:contexts});
    window.AudioContext=class extends Native { constructor(){super();contexts.push(this);} };
  });
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/debug/audio/?vol=orbit');
  const arrangement=page.getByRole('combobox',{name:'Arrangement',exact:true});
  await expect(arrangement).toHaveValue('original');
  await expect(page.getByRole('button',{name:'Play Bass',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'DRIFT',exact:true}).click();
  await arrangement.selectOption('m1');
  await expect(page).toHaveURL(/arrangement=m1/);
  await expect(page.getByText(/Audition candidate; gameplay uses Original/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Play Bass',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Play Pluck',exact:true})).toHaveCount(0);
  await expect(page.getByRole('slider',{name:'Timeline position',exact:true})).toHaveAttribute('aria-valuenow','15.00');
  await page.getByRole('button',{name:'Play Lead',exact:true}).click();
  await expect(page.getByText('Playing · Lead',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Solo Pad',exact:true}).click();
  await page.getByRole('slider',{name:'Pad gain',exact:true}).fill('0.75');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'ECLIPSE',exact:true}).click();
  await page.getByRole('button',{name:'Play all',exact:true}).click();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Reset mix',exact:true}).click();
  await page.getByRole('button',{name:'AURORA',exact:true}).click();
  await expect(page.getByText('Waveforms ready',{exact:true})).toBeVisible({timeout:180_000});
  await page.screenshot({path:info.outputPath('m1-inspector.png'),fullPage:true});
  const downloadPromise=page.waitForEvent('download',{timeout:780_000});
  await page.getByRole('button',{name:'Render to WAV',exact:true}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('ORBIT-M1-F1-ORIGINAL-LEAD.wav');
  await download.saveAs(info.outputPath(download.suggestedFilename()));
  await expect(page.getByText(/Done · .*184.0 s/)).toBeVisible();
  await arrangement.selectOption('original');
  await expect(page.getByRole('slider',{name:'Timeline position',exact:true})).toHaveAttribute('aria-valuenow','120.00');
  await expect(page.getByRole('button',{name:'Play Bass',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption('daybreak');
  await expect(arrangement).toHaveCount(0);
  await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption('orbit');
  await expect(arrangement).toHaveValue('original');
  await page.getByRole('link',{name:'SoFarAway',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).m1Contexts.every((ctx:AudioContext)=>ctx.state==='closed'))).toBe(true);
  expect(errors).toEqual([]);
});

test('M1 selected Lead WAV contains the early preview and DRIFT answer, with no Bass export',async({page},info)=>{
  test.setTimeout(300_000);
  await page.route('**/m1-stem-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>M1 stem</title>'}));
  await page.goto('http://127.0.0.1:8091/m1-stem-check');
  const result=await page.evaluate(async()=>{
    const load=(path:string)=>import(/* @vite-ignore */path);
    const {inspectorScore}=await load('/app/game/debug/audio/track-adapter.ts');
    const {volumeById}=await load('/app/game/core/volumes.ts');
    const {exportStem}=await load('/app/game/debug/audio/stem-export.client.ts');
    const score=inspectorScore(volumeById('orbit'),'m1');
    let rejectedBass=false;
    try{await exportStem(score,'bass');}catch{rejectedBass=true;}
    const result=await exportStem(score,'lead');
    const buffer=await new OfflineAudioContext(2,1,44100).decodeAudioData(await result.blob.arrayBuffer());
    const power=(start:number,end:number)=>{
      let sum=0;for(let ch=0;ch<2;ch++)for(let i=start*44100;i<end*44100;i++)sum+=buffer.getChannelData(ch)[i]**2;
      return Math.sqrt(sum/(2*(end-start)*44100));
    };
    return {rejectedBass,filename:result.filename,duration:buffer.duration,rate:buffer.sampleRate,
      peak:result.peak,opening:power(3,7),answer:power(19,22),silence:power(0,2)};
  });
  await info.attach('M1 real stem export',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result).toMatchObject({rejectedBass:true,filename:'ORBIT-STARWAKE-M1-LEAD.wav',duration:184,rate:44100});
  expect(result.peak).toBeLessThan(1);expect(result.opening).toBeGreaterThan(.01);expect(result.answer).toBeGreaterThan(.01);
  expect(result.silence).toBe(0);
});

test('arrangement comparisons retain position only within the same volume',async({page})=>{
  await page.goto('/debug/audio/?vol=orbit&arrangement=m1');
  await page.getByRole('button',{name:'AURORA',exact:true}).click();
  const position=page.getByRole('slider',{name:'Timeline position',exact:true});
  await expect(position).toHaveAttribute('aria-valuenow','120.00');
  await page.getByRole('combobox',{name:'Arrangement',exact:true}).selectOption('original');
  await expect(position).toHaveAttribute('aria-valuenow','120.00');
  await page.getByRole('combobox',{name:'Volume',exact:true}).selectOption('daybreak');
  await page.getByRole('button',{name:'SUNBURST',exact:true}).click();
  await expect(position).toHaveAttribute('aria-valuenow','80.00');
  await page.goBack();
  await expect(page.getByRole('combobox',{name:'Arrangement',exact:true})).toHaveValue('original');
  await expect(position).toHaveAttribute('aria-valuenow','0.00');
});
