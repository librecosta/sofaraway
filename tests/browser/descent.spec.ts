import { expect, test } from '@playwright/test';
import { branchLayout, ROUTE_LABELS, routeSides } from '../../app/game/core/branches';
import { STEP } from '../../app/game/core/clock';
import { lanePoint, RANGE_X, RANGE_Y } from '../../app/game/core/collision';
import { descentGateKinds, matrixCell } from '../../app/game/core/descent-gates';
import { descentCargo, descentJunction } from '../../app/game/core/descent-routes';
import { idleInput } from '../../app/game/core/input';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { descentExamples, gateDescription } from '../../app/game/debug/catalog';

test('Impossible cruise renders the DESCENT music rooms and the DAYBREAK junction on their cues', async ({ page }, info) => {
  for (const { id, beat, section, room } of [
    { id: 'descent', beat: 272, section: 'HOLD', room: 'CORE' },
    { id: 'descent', beat: 300, section: 'LOCKDOWN', room: 'LOCKDOWN' },
    { id: 'daybreak', beat: 226, section: 'RETURN', room: undefined },
  ] as const) {
    const volume = volumeById(id);
    const sim = new Simulation(volume);
    sim.start('impossible', 0);
    const station = sim.reference.station(beat, 'standard');
    await page.goto(`/?vol=${id}&diff=impossible&align=1&god=0&t=${beat * 60 / volume.bpm}&q=low&dbg=1`);
    const diagnostics = page.locator('#errbox');
    await expect(diagnostics).toContainText('"trackDistance"');
    await expect(page.locator('#hud-section')).toHaveText(section);
    const actual = JSON.parse((await diagnostics.textContent())!);
    expect(Math.abs(actual.trackDistance - station)).toBeLessThan(2);
    if (room) {
      expect(actual.descentLighting.room).toBe(room);
      expect(actual.descentLighting.beat).toBeCloseTo(beat, 5);
    } else {
      expect(actual.routeHologram).toMatchObject({ center: 'MAIN' });
      expect(actual.branch.side).toBeNull();
    }
    await page.locator('canvas').screenshot({ path: info.outputPath(`${id}-${section}.png`) });
  }
});

test('DESCENT glass is loaded before entering view and drawn across the full sight range', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  for (const kind of descentGateKinds) for (const boost of [false, true]) {
    const { samples, glError } = await page.evaluate(({ kind, boost }) =>
      window.b0Harness.inspectGateApproach('descent', kind, boost ? 'low' : 'high', false, boost), { kind, boost });
    const at = (distance: number) => samples.find(({ ahead }) => ahead === distance)!;
    expect(at(451)).toMatchObject({ queued: false, created: false });
    expect(at(445)).toMatchObject({ queued: true, created: true, contrastPixels: 0 });
    expect(at(405).contrastPixels).toBeGreaterThan(0);
    expect(at(280).contrastPixels).toBeGreaterThan(5);
    expect(samples.filter(({ ahead }) => ahead <= 405).every(({ fade }) => fade === 1)).toBe(true);
    expect(at(9).contrastPixels).toBeGreaterThan(at(160).contrastPixels * 10);
    expect(glError).toBe(0);
  }
});

test('rear glass gates contribute a distinct render through a real PRESSURE sequence', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  for (const boost of [false, true]) {
    const { samples, glError } = await page.evaluate(boost =>
      window.b0Harness.inspectGateApproach('descent', 'laser-weave', 'high', false, boost, true), boost);
    for (const { ahead, inFront, fade, contrastPixels } of samples.filter(({ ahead }) => ahead >= 85)) {
      expect(inFront, `gate order at distance ${ahead}`).toBeGreaterThanOrEqual(2);
      expect(fade).toBe(1);
      expect(contrastPixels).toBeGreaterThan(20);
    }
    expect(glError).toBe(0);
  }
});

test('an Impossible Matrix is visible behind earlier PRESSURE gates at full Boost', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const { beat, samples, glError } = await page.evaluate(() =>
    window.b0Harness.inspectGateApproach('descent', 'laser-matrix', 'high', false, true, true, 'impossible'));
  expect(beat).toBe(202.75);
  for (const { ahead, inFront, visible, fade, contrastPixels } of samples.filter(sample => sample.ahead >= 85)) {
    expect(inFront, `gate order at distance ${ahead}`).toBeGreaterThanOrEqual(2);
    expect(visible).toBe(true);
    expect(fade).toBe(1);
    expect(contrastPixels).toBeGreaterThan(5);
  }
  expect(samples.find(sample => sample.ahead === 32)!.contrastPixels).toBeGreaterThan(20);
  expect(glError).toBe(0);
});

test('the Debug library renders all 20 DESCENT glass profiles and seven facility chapters', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/debug/gates/?vol=descent');
  for (const kind of descentGateKinds) {
    const { label } = gateDescription(kind);
    const canvas = page.getByRole('img', { name: `${label} gate` });
    const select = page.getByRole('combobox', { name: `${label} opening` });
    const images = new Set<string>();
    await expect(select).toBeEnabled();
    for (const index of descentExamples[kind].keys()) {
      await select.selectOption(String(index));
      const { open, axis } = descentExamples[kind][index];
      await expect(canvas).toHaveAttribute('data-rendered-opening', String(open));
      await expect(canvas).toHaveAttribute('data-rendered-axis', String(axis));
      images.add(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()));
    }
    expect(images.size).toBe(descentExamples[kind].length);
    await select.selectOption('0');
    await canvas.screenshot({ path: info.outputPath(`${kind}.png`) });
  }
  await page.goto('/debug/worlds/?vol=descent');
  await page.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = page.getByRole('img', { name: 'Live DESCENT facility' });
  const chapter = page.getByRole('combobox', { name: 'CONTROL chapter' });
  const frames = [16, 39, 117, 207, descentCargo.beat - .9, 314, 377];
  const stations: number[] = [];
  for (const [index, beat] of frames.entries()) {
    await chapter.selectOption(String(index));
    await expect(canvas).toHaveAttribute('data-light-beat', beat.toFixed(3));
    stations.push(Number(await canvas.getAttribute('data-station')));
    await canvas.screenshot({ path: info.outputPath(`chapter-${index + 1}.png`) });
  }
  expect(stations.every((station, i) => i === 0 || station > stations[i - 1])).toBe(true);
  await chapter.selectOption('5');
  await expect(canvas).toHaveAttribute('data-light-beat', '314.000');
  const cruise = await canvas.screenshot();
  await page.getByRole('checkbox', { name: 'Boost view' }).check();
  const boost = await canvas.screenshot({ path: info.outputPath('lockdown-boost.png') });
  expect(boost.equals(cruise)).toBe(false);

  const facility = page.locator('#descent');
  await facility.getByRole('checkbox', { name: 'Boost view' }).uncheck();
  // Low has no depth-of-field easing, so only the light cue changes between draws.
  await facility.getByRole('combobox', { name: 'Quality' }).selectOption('low');
  const firstCue = await canvas.screenshot();
  const offset = facility.getByRole('slider', { name: 'Light beat offset' });
  const station = await canvas.getAttribute('data-station');
  await offset.fill('1.25');
  await expect(canvas).toHaveAttribute('data-light-beat', '315.250');
  await expect(canvas).toHaveAttribute('data-station', station!);
  expect((await canvas.screenshot()).equals(firstCue)).toBe(false);

  await facility.getByRole('checkbox', { name: 'Dynamic lighting' }).uncheck();
  const steady = await canvas.screenshot();
  await offset.fill('2');
  await expect(canvas).toHaveAttribute('data-light-beat', '316.000');
  await expect(canvas).toHaveAttribute('data-light-amount', '0.000');
  expect((await canvas.screenshot()).equals(steady)).toBe(false);

  const transfer = facility.getByRole('combobox', { name: 'Transfer chamber' });
  await transfer.selectOption({ label: 'Approach' });
  const approach = facility.getByRole('slider', { name: 'Approach beat' });
  await expect(canvas).toHaveAttribute('data-light-beat', '123.000');
  await canvas.screenshot({ path: info.outputPath('approach-before-last-shutter.png') });
  await approach.fill('130');
  await expect(canvas).toHaveAttribute('data-light-beat', '130.000');
  await expect(canvas).toHaveAttribute('data-route', '');
  await canvas.screenshot({ path: info.outputPath('approach-recognition.png') });
  await facility.getByRole('combobox', { name: 'Approach route' }).selectOption('challenge');
  await approach.press('End');
  await expect(canvas).toHaveAttribute('data-light-beat', '145.500');
  await expect(canvas).toHaveAttribute('data-route', 'challenge');
  await transfer.selectOption({ label: 'Challenge guideway' });
  await expect(canvas).toHaveAttribute('data-route', 'challenge');
  const challenge = await canvas.screenshot({ path: info.outputPath('guideway-challenge.png') });
  await transfer.selectOption({ label: 'Bonus guideway' });
  await expect(canvas).toHaveAttribute('data-route', 'score');
  expect((await canvas.screenshot({ path: info.outputPath('guideway-bonus.png') })).equals(challenge)).toBe(false);
  expect(errors).toEqual([]);
});

test('the fixed DESCENT camera plays, isolates and restores the production lighting score with CONTROL audio', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/debug/worlds/?vol=descent');
  const facility = page.locator('#descent');
  await facility.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = facility.getByRole('img', { name: 'Live DESCENT facility' });
  const phrase = facility.getByRole('combobox', { name: 'Lighting phrase' });
  const quality = facility.getByRole('combobox', { name: 'Quality' });
  const focus = facility.getByRole('combobox', { name: 'Lighting focus' });
  const seek = facility.getByRole('slider', { name: 'Score beat' });
  await facility.getByRole('combobox', { name: 'CONTROL chapter' }).selectOption('5');
  await expect(canvas).toHaveAttribute('data-light-beat', '314.000');
  const station = await canvas.getAttribute('data-station');
  await expect(phrase.locator('option')).toHaveCount(25);
  await phrase.selectOption('18');
  await facility.getByRole('combobox', { name: 'Playback length' }).selectOption('16');
  await expect(seek).toHaveAttribute('max', '352');
  const play = facility.getByRole('button', { name: 'Play lighting', exact: true });
  const pause = facility.getByRole('button', { name: 'Pause lighting' });
  const currentBeat = async () => Number(await canvas.getAttribute('data-light-beat'));
  await play.click();
  await expect(pause).toBeVisible();
  const frames: Buffer[] = [];
  for (const target of [289, 290, 292]) {
    await expect.poll(currentBeat).toBeGreaterThan(target);
    frames.push(await canvas.screenshot({ path: info.outputPath(`score-playback-${target}.png`) }));
  }
  expect(frames.every((frame, i) => i === 0 || !frame.equals(frames[i - 1]))).toBe(true);
  await pause.click();
  const paused = await currentBeat();
  await page.waitForTimeout(350);
  expect(await currentBeat()).toBe(paused);
  await play.click();
  await expect.poll(currentBeat).toBeGreaterThan(paused + .5);
  await facility.getByRole('button', { name: 'Replay lighting' }).click();
  await expect(pause).toBeVisible();
  expect(await currentBeat()).toBeLessThan(290);
  await pause.click();
  await facility.getByRole('combobox', { name: 'Playback length' }).selectOption('8');
  await expect(seek).toHaveAttribute('max', '320');
  await seek.fill('311');
  await expect(canvas).toHaveAttribute('data-light-beat', '311.000');
  const isolated = new Set<string>();
  for (const group of ['roof', 'floor', 'left', 'right', 'glass']) {
    await focus.selectOption(group);
    const frame = await canvas.screenshot({ path: info.outputPath(`group-${group}.png`) });
    isolated.add(frame.toString('base64'));
  }
  expect(isolated.size).toBe(5);
  for (const profile of ['low', 'auto', 'high']) {
    await quality.selectOption(profile);
    await focus.selectOption('all');
    await seek.press('ArrowRight');
    await expect(canvas).toHaveAttribute('data-station', station!);
    await expect(canvas).toHaveAttribute('data-light-amount', '1.000');
  }
  const dynamics = facility.getByRole('checkbox', { name: 'Dynamic lighting' });
  await quality.selectOption('low');
  await dynamics.uncheck();
  await seek.fill('311');
  await expect(canvas).toHaveAttribute('data-light-beat', '311.000');
  await expect(canvas).toHaveAttribute('data-light-amount', '0.000');
  const quiet = await canvas.screenshot();
  await seek.fill('315');
  await expect(canvas).toHaveAttribute('data-light-beat', '315.000');
  expect((await canvas.screenshot()).equals(quiet)).toBe(false);
  await dynamics.check();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-light-amount', '0.000');
  const reduced = await canvas.screenshot();
  await seek.fill('311');
  await expect(canvas).toHaveAttribute('data-light-beat', '311.000');
  expect((await canvas.screenshot()).equals(reduced)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(canvas).toHaveAttribute('data-light-amount', '1.000');
  const recovery = await canvas.evaluateHandle(element => (element as HTMLCanvasElement).getContext('webgl2')!
    .getExtension('WEBGL_lose_context'));
  await recovery.evaluate(ext => ext!.loseContext());
  const status = facility.locator('p[role="status"]');
  await expect(status).toContainText('Waiting for WebGL');
  await recovery.evaluate(ext => ext!.restoreContext());
  await expect(status).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-station', station!);
  await expect(canvas).toHaveAttribute('data-light-amount', '1.000');
  expect(errors).toEqual([]);
});

test('the original DESCENT lenses and glass face render the score with Dynamic Lights off', async ({ page }, info) => {
  await page.goto('/debug/worlds/?vol=descent');
  const facility = page.locator('#descent');
  await facility.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = facility.getByRole('img', { name: 'Live DESCENT facility' });
  await facility.getByRole('combobox', { name: 'CONTROL chapter' }).selectOption('5');
  await facility.getByRole('combobox', { name: 'Quality' }).selectOption('low');
  const phrase = facility.getByRole('combobox', { name: 'Lighting phrase' });
  const focus = facility.getByRole('combobox', { name: 'Lighting focus' });
  await phrase.selectOption('18');
  const cursor = facility.getByRole('slider', { name: 'Score beat' });
  await facility.getByRole('checkbox', { name: 'Dynamic lighting' }).uncheck();
  const shot = async (beat: number, label: string) => {
    await cursor.fill(String(beat));
    await expect(canvas).toHaveAttribute('data-light-beat', beat.toFixed(3));
    await expect(canvas).toHaveAttribute('data-light-amount', '0.000');
    return (await canvas.screenshot({ path: info.outputPath(`${label}.png`) })).toString('base64');
  };
  await focus.selectOption('glass');
  const lensMask = await shot(310, 'lens-mask');
  await focus.selectOption('all');
  const redRelay = await shot(310, 'red-relay');
  const [roof, floor] = JSON.parse((await canvas.getAttribute('data-fixtures'))!) as number[][];
  expect(roof[0]).toBeGreaterThan(roof[1] * 2);
  expect(floor[1]).toBeGreaterThan(roof[1] * 2);
  const armed = await shot(305, 'amber-interlocks');
  const reply = await shot(314, 'red-relay-reply');
  await phrase.selectOption('3');
  const blue = await shot(60, 'side-relay');
  const { lenses, pane } = await page.evaluate(async ([base, ...frames]) => {
    const pixels = async (png: string) => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + png)).blob());
      const readback = new OffscreenCanvas(img.width, img.height).getContext('2d')!;
      readback.drawImage(img, 0, 0);
      const data = readback.getImageData(0, 0, img.width, img.height);
      img.close();
      return data;
    };
    const [{ width, height, data: off }, ...on] = await Promise.all([base, ...frames].map(pixels));
    const region = (x0: number, x1: number, y0: number, y1: number, accept: (p: number) => boolean) => {
      const mask: number[] = [];
      for (let y = Math.floor(height * y0); y < Math.floor(height * y1); y++) {
        for (let x = Math.floor(width * x0); x < Math.floor(width * x1); x++) {
          const p = (y * width + x) * 4;
          if (accept(p)) mask.push(p);
        }
      }
      return { count: mask.length, frames: on.map(({ data }) => {
        let red = 0, green = 0, blue = 0, changed = 0;
        for (const p of mask) {
          const [r, g, b] = data.subarray(p, p + 3);
          red += r;
          green += g;
          blue += b;
          if (Math.max(Math.abs(r - off[p]), Math.abs(g - off[p + 1]), Math.abs(b - off[p + 2])) > 30) changed++;
        }
        return { warm: (red - blue) / mask.length, green: green / mask.length,
          luma: (.213 * red + .715 * green + .072 * blue) / mask.length, coverage: changed / mask.length };
      }) };
    };
    const neutralLens = (p: number) => {
      const [r, g, b] = off.subarray(p, p + 3);
      return Math.max(r, g, b) - Math.min(r, g, b) < 65 && r + g + b > 270;
    };
    return {
      // The glass-only view leaves the fixture diffusers at their original color.
      lenses: [region(.35, .61, .16, .28, neutralLens), region(.35, .61, .70, .81, neutralLens)],
      // Inside the left wedge, away from the chamfer, aperture, and rails.
      pane: region(.42, .45, .478, .516, () => true),
    };
  }, [lensMask, redRelay, armed, reply, blue]);
  for (const { count, frames } of lenses) {
    expect(count).toBeGreaterThan(90);
    expect(frames[0].coverage).toBeGreaterThan(.58);
    expect(frames[0].warm).toBeGreaterThan(24);
    expect(Math.max(...frames.map(frame => frame.luma)) - Math.min(...frames.map(frame => frame.luma))).toBeGreaterThan(12);
  }
  expect(lenses[1].frames[0].green).toBeGreaterThan(lenses[0].frames[0].green + 13);
  expect(pane.frames[0].warm).toBeGreaterThan(20);
  expect(pane.frames[3].warm).toBeLessThan(-12);
  expect(pane.frames[3].coverage).toBeGreaterThan(.6);
});

test('a fresh DESCENT game uses the CONTROL lighting score without changing preferences', async ({ page }, info) => {
  await page.goto('/?vol=descent&dbg=1');
  const diagnostics = page.locator('#errbox');
  const metrics = async () => JSON.parse((await diagnostics.textContent()) || '{}') as {
    phase: string; beat: number; lightTime: number; dynamics: { amount: number };
    descentLighting: { beat: number; amount: number; fixtures: number[][]; pane: number[]; rim: number };
  };
  await page.locator('[data-act=start]').click();
  await expect.poll(async () => (await metrics()).phase).toBe('playing');
  const initial = await metrics();
  await expect.poll(async () => (await metrics()).beat).toBeGreaterThan(5);
  const later = await metrics();
  for (const frame of [initial, later]) {
    expect(frame.dynamics.amount).toBe(0);
    expect(frame.descentLighting.amount).toBe(0);
    expect(frame.descentLighting.beat).toBeCloseTo(frame.lightTime * 136 / 60, 7);
    expect(frame.descentLighting.rim).toBeGreaterThan(0);
    const [red, , blue] = frame.descentLighting.pane;
    expect(blue).toBeGreaterThan(red * 2);
  }
  expect(initial.descentLighting.fixtures[0]).not.toEqual(later.descentLighting.fixtures[0]);
  expect(initial.descentLighting.fixtures[1]).not.toEqual(later.descentLighting.fixtures[1]);
  expect(await page.evaluate(() => localStorage.getItem('sofaraway.dynamicLights'))).toBeNull();
  await diagnostics.evaluate(element => element.setAttribute('hidden', ''));
  await page.locator('#gl').screenshot({ path: info.outputPath('default-descent-flight.png') });
});

test('the four setpieces fly continuously in the production preview with selectable transfer routes', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/debug/worlds/?vol=descent');
  const facility = page.locator('#descent');
  await facility.getByRole('button', { name: 'Open live scene' }).click();
  const canvas = facility.getByRole('img', { name: 'Live DESCENT facility' });
  const flight = facility.getByRole('combobox', { name: 'Setpiece flight' });
  const beat = facility.getByRole('slider', { name: 'Score beat' });
  const play = facility.getByRole('button', { name: 'Play lighting', exact: true });
  const pause = facility.getByRole('button', { name: 'Pause lighting' });
  const station = async () => Number(await canvas.getAttribute('data-station'));
  const scrub = async (at: number) => {
    await beat.fill(String(at));
    await expect(canvas).toHaveAttribute('data-light-beat', at.toFixed(3));
  };
  await facility.getByRole('combobox', { name: 'Quality' }).selectOption('auto');
  await facility.getByRole('checkbox', { name: 'Dynamic lighting' }).uncheck();
  await flight.selectOption('0');
  await scrub(133);
  await expect(canvas).toHaveAttribute('data-route', '');
  for (const route of ['main', 'challenge', 'score']) {
    await facility.getByRole('combobox', { name: 'Approach route' }).selectOption(route);
    await scrub(155);
    await expect(canvas).toHaveAttribute('data-route', route);
    await canvas.screenshot({ path: info.outputPath(`transfer-${route}.png`) });
  }
  await scrub(165);
  await scrub(133);
  await expect(canvas).toHaveAttribute('data-route', '');
  for (const [index, name, start] of [[0, 'transfer', 132], [1, 'well', 207], [2, 'core', 264], [3, 'release', 351]] as const) {
    await flight.selectOption(String(index));
    await scrub(start);
    const opening = await station();
    await play.click();
    await expect(pause).toBeVisible();
    for (const offset of [1, 2, 3]) {
      await expect.poll(async () => Number(await canvas.getAttribute('data-light-beat'))).toBeGreaterThan(start + offset);
      await canvas.screenshot({ path: info.outputPath(`${name}-${offset}.png`) });
    }
    await pause.click();
    const held = await station();
    expect(held).toBeGreaterThan(opening + 22);
    await expect.poll(station).toBe(held);
    await expect(canvas).toHaveAttribute('data-light-amount', '0.000');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await flight.selectOption('0');
  await facility.getByRole('combobox', { name: 'Flight mode' }).selectOption('sightseeing');
  await facility.getByRole('checkbox', { name: 'Boost view' }).check();
  await scrub(149);
  await expect(canvas).toHaveAttribute('data-mode', 'sightseeing');
  await expect(canvas).toHaveAttribute('data-route', 'score');
  expect(errors).toEqual([]);
});

const transferFlights = [
  { route: 'main', difficulty: 'normal', mode: 'standard', seed: 0, speed: 'cruise' },
  { route: 'challenge', difficulty: 'hard', mode: 'standard', seed: 1, speed: 'boost' },
  { route: 'score', difficulty: 'hard', mode: 'standard', seed: 0, speed: 'boost' },
  { route: 'challenge', difficulty: 'impossible', mode: 'standard', seed: 0, speed: 'boost' },
  { route: 'challenge', difficulty: 'normal', mode: 'standard', seed: 0, speed: 'intervals' },
  { route: 'score', difficulty: 'normal', mode: 'sightseeing', seed: 1, speed: 'intervals' },
] as const;

for (const { route, difficulty, mode, seed, speed } of transferFlights) {
  test(`the live DESCENT approach uses manual steering through ${route}, ${mode}, ${seed}, ${speed}, ${difficulty}`, async ({ page }, info) => {
    const impossible = difficulty === 'impossible';
    const approachBeat = impossible ? 122 : 123;
    const layout = branchLayout(seed);
    const side = routeSides.find(side => layout[side] === route)!;
    const sim = new Simulation(volumeById('descent'), { align: true });
    sim.start(difficulty, seed, undefined, mode);
    const path = sim.junctionPath!;
    const lead = sim.mainGates.filter(gate => gate.beat > approachBeat && gate.worldStation < path.split);
    const exit = sim.mainGates.find(gate => gate.worldStation >= path.end)!;
    const gates = sim.branchGates![route];
    // Impossible reaches the same approach station at an earlier music beat.
    const approachStation = sim.reference.station(approachBeat, mode);
    if (impossible) while (sim.trackDistance < approachStation && sim.phase === 'playing') sim.step(STEP, idleInput);
    const startBeat = impossible ? sim.beat : approachBeat;
    await page.goto('http://127.0.0.1:8090/');
    const before = await page.evaluate(async ({ difficulty, mode, seed, startBeat }) => {
      const test = window.b0Harness;
      await test.mount({ volumeId: 'descent', runSeed: seed, difficulty, mode, quality: 'high', dynamicLights: true,
        diagnostics: { fixedTime: null, autoplay: false, god: false, align: true, boost: false,
          mobileQuality: false, post: true, record: false, debug: true } });
      await test.start(true);
      test.advanceAndPause(startBeat, true);
      await test.resume(true);
      return test.snapshot().gatesPassed;
    }, { difficulty, mode, seed, startBeat });
    const snap = () => page.evaluate(() => window.b0Harness.snapshot());
    const state = () => page.evaluate(() => window.b0Harness.branchState());
    const poll = <T>(query: () => Promise<T>) => expect.poll(query, { intervals: [20, 30, 50] });
    const { width, height } = page.viewportSize()!;
    const steer = (x: number, y: number) => page.mouse.move(width * (1 + x / RANGE_X) / 2, height * (1 - y / RANGE_Y) / 2);
    const aim = (gate: typeof exit) => steer(...lanePoint(gate.kind, gate.open, gate.axis));
    const canvas = page.locator('canvas');
    if (speed !== 'cruise') await page.keyboard.down('Shift');
    for (const [i, gate] of lead.entries()) {
      await aim(gate);
      await poll(async () => (await snap()).gatesPassed).toBe(before + i + 1);
    }
    const last = await state();
    expect(last.lastGate?.beat).toBe(lead.at(-1)?.beat);
    expect(last.metrics.routeHologram).toBeUndefined();
    expect(last.metrics.junctionMeshes).toBe(3);
    expect(last.route).toBeNull();
    if (speed === 'boost') expect(last.speed).toBeGreaterThan(impossible ? 56 : 49);
    if (speed === 'intervals') await page.keyboard.up('Shift');

    const labels = { left: ROUTE_LABELS[layout.left], center: 'MAIN', right: ROUTE_LABELS[layout.right] };
    await poll(async () => (await state()).metrics.routeHologram).toEqual(labels);
    const recognition = await state();
    expect(recognition.route).toBeNull();
    expect(recognition.trackDistance).toBeGreaterThan(lead.at(-1)!.worldStation);
    await canvas.screenshot({ path: info.outputPath('recognition.png') });
    await poll(async () => (await state()).time).toBeGreaterThanOrEqual(recognition.time + .5);
    await steer(side === 'left' ? -3.1 : side === 'right' ? 3.1 : 0, 0);
    await poll(async () => (await state()).routeSide).toBe(side);
    expect((await state()).route).toBeNull();
    if (speed === 'intervals') await page.keyboard.down('Shift');
    await poll(async () => (await snap()).route).toBe(route);
    const committed = await state();
    expect(committed.branch?.side).toBe(side);
    expect(committed.trackDistance).toBeGreaterThanOrEqual(path.split);
    expect(committed.lastGate).toEqual(last.lastGate);
    expect(committed.time - last.lastGate!.crossedAt!).toBeGreaterThan(impossible ? 3.25 : 3.6);
    expect(committed.time - recognition.time).toBeGreaterThan(impossible ? 2.75 : 3.1);

    let firstEntry = 0;
    for (const [i, gate] of gates.entries()) {
      await aim(gate);
      if (i === 0) {
        await poll(async () => (await state()).trackDistance).toBeGreaterThanOrEqual(gate.worldStation - 33 * (mode === 'sightseeing' ? 1 / 3 : 1));
        await canvas.screenshot({ path: info.outputPath('first-route-shutter.png') });
      }
      await poll(async () => (await snap()).gatesPassed).toBe(before + lead.length + i + 1);
      if (i === 0) {
        firstEntry = (await state()).lastGate!.crossedAt!;
        expect(firstEntry - committed.time).toBeGreaterThan(impossible ? 1.55 : 1.7);
      }
    }
    const lastOnRoute = (await state()).lastGate!;
    if (speed === 'intervals') await page.keyboard.up('Shift');
    await steer(0, 0);
    await aim(exit);
    await poll(async () => (await state()).trackDistance).toBeGreaterThanOrEqual(path.end);
    const merged = await state();
    expect(merged.lastGate).toEqual(lastOnRoute);
    await poll(async () => (await snap()).gatesPassed).toBe(before + lead.length + gates.length + 1);
    if (speed === 'boost') await page.keyboard.up('Shift');
    expect(await snap()).toMatchObject({ phase: 'playing', route,
      lives: mode === 'sightseeing' ? 5 : difficulty === 'hard' || impossible ? 1 : 2 });
    if (impossible) expect((await snap()).gatesTotal).toBe(190);
    const after = await state();
    expect(after.pickup?.status).toBe('pending');
    expect(after.sharedPath).toBe(true);
    expect(after.lastGate?.beat).toBe(exit.beat);
    await info.attach('choice-window', { contentType: 'application/json', body: JSON.stringify({
      speed, crossingSpeed: last.speed, lastGate: last.lastGate, recognition: recognition.time,
      commitment: committed.time, firstEntry, merge: merged.time, backOnSpine: after.lastGate,
      stations: { last: lead.at(-1)!.worldStation, choice: path.split, first: gates[0].worldStation, merge: path.end, shared: exit.worldStation },
    }, null, 2) });
    await page.evaluate(() => window.b0Harness.dispose());
  });
}

for (const difficulty of ['normal', 'hard', 'impossible'] as const) {
  test(`live ${difficulty} flight keeps gates readable through the shaft, core and escape`, async ({ page }, info) => {
    await page.goto('http://127.0.0.1:8090/');
    await page.evaluate(async difficulty => {
      await window.b0Harness.mount({ volumeId: 'descent', difficulty, quality: 'high', dynamicLights: true, diagnostics: {
        fixedTime: null, autoplay: false, god: false, align: true, boost: false,
        mobileQuality: false, post: true, record: false, debug: true,
      } });
      await window.b0Harness.start(true);
    }, difficulty);
    const metrics = () => page.evaluate(() => JSON.parse(window.b0Harness.metrics() || '{}') as {
      phase: string; beat: number; speed: number; hitCount: number; chunks: number; postFailure: string | null;
      dynamics: { amount: number };
      lightTime: number; descentLighting: { beat: number; phrase: number; amount: number; rim: number };
    });
    for (const [label, beat, boost] of [
      ['shaft', 204, true], ['core', 269, false], ['lockdown', 312, true], ['breach', 367, false],
    ] as const) {
      await page.evaluate(async at => {
        window.b0Harness.advanceAndPause(at);
        await window.b0Harness.resume(true);
      }, beat);
      if (boost) await page.keyboard.down('Shift');
      await expect.poll(async () => (await metrics()).beat).toBeGreaterThan(beat + 3);
      const snapshot = await metrics();
      expect(snapshot).toMatchObject({ phase: 'playing', hitCount: 0, postFailure: null, dynamics: { amount: 1 } });
      expect(snapshot.descentLighting.beat).toBeCloseTo(snapshot.lightTime * 136 / 60, 7);
      expect(snapshot.descentLighting.rim).toBeGreaterThan(0);
      expect(snapshot.chunks).toBeLessThanOrEqual(5);
      if (boost) {
        expect(snapshot.speed).toBeGreaterThan(difficulty === 'impossible' ? 49 : 43);
        await page.keyboard.up('Shift');
      }
      if (label === 'lockdown') {
        await page.evaluate(() => window.b0Harness.pause());
        await expect.poll(async () => (await metrics()).phase).toBe('paused');
        const held = (await metrics()).descentLighting.beat;
        await page.waitForTimeout(320);
        expect((await metrics()).descentLighting.beat).toBe(held);
        await page.evaluate(() => window.b0Harness.resume(true));
        await expect.poll(async () => (await metrics()).descentLighting.beat).toBeGreaterThan(held + .25);
      }
      await page.locator('canvas').screenshot({ path: info.outputPath(`live-${label}.png`) });
    }
    await page.evaluate(() => window.b0Harness.dispose());
  });
}

test('the production DESCENT Impossible run shows its result and restarts with one life', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sofaraway.immersiveMouse', 'false'));
  await page.goto('/?vol=descent&q=low');
  const next = page.getByRole('button', { name: 'Next difficulty' });
  await next.click();
  await next.click();
  await expect(page.locator('#diff [data-selected=true]')).toHaveText('IMPOSSIBLE');
  const start = page.locator('[data-act=start]');
  await start.click();
  await expect(page.locator('#hud-gates')).toHaveText('0/189');
  await expect(page.locator('#hud-lives i')).toHaveCount(1);
  const { width, height } = page.viewportSize()!;
  // Steer into the first Matrix pane at its central beam footprint.
  await page.mouse.move(width * (1 + matrixCell[0] / 6 / RANGE_X) / 2, height / 2);
  await expect(page.locator('#over-title')).toHaveText('TERMINATED', { timeout: 15_000 });
  await expect(page.locator('#over').getByText('IMPOSSIBLE', { exact: true })).toBeVisible();
  await expect(page.locator('#over-gates')).toHaveText('0/189');
  await expect.poll(() => page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('sofaraway.records.v1') ?? '{}');
    return records.standard?.['descent-encore']?.impossible?.last?.outcome;
  })).toBe('TERMINATED');
  await page.locator('[data-act=restart]').click();
  await expect(page.locator('#hud-lives i')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(start).toBeVisible();
  await expect(page.locator('#diff [data-selected=true]')).toHaveText('IMPOSSIBLE');
});

test('full Boost on DESCENT Impossible streams the final corridor through escape', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:8090/');
  await page.evaluate(async () => {
    const test = window.b0Harness;
    await test.mount({ volumeId: 'descent', difficulty: 'impossible', quality: 'low', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post: true, record: false, debug: true,
    } });
    await test.start(true);
  });
  await page.keyboard.down('Shift');
  const reward = await page.evaluate(async () => {
    const test = window.b0Harness;
    const state = test.advanceAndPause(320);
    const result = test.snapshot();
    await test.resume(true);
    return { state, result };
  });
  expect(reward.state.metrics.encoreMeshes).toBeGreaterThan(0);
  expect(reward.result.encore?.passed).toBeGreaterThan(0);
  expect(reward.state.metrics.descentLighting?.afterglow).toBe(0);
  await page.locator('canvas').screenshot({ path: info.outputPath('impossible-encore.png') });
  await page.keyboard.up('Shift');
  await page.keyboard.down('Shift');
  const ending = await page.evaluate(async () => {
    const test = window.b0Harness;
    const state = test.advanceAndPause(382);
    const runway = test.corridor()!.length - state.trackDistance;
    await test.resume(true);
    return { ...state, runway };
  });
  expect(ending.speed).toBeCloseTo(56.695, 4);
  expect(ending.runway).toBeGreaterThan(650);
  expect(ending.metrics.calls).toBeGreaterThan(0);
  expect(ending.metrics.chunks).toBeGreaterThan(1);
  expect(ending.metrics.chunks).toBeLessThanOrEqual(5);
  expect(ending.metrics.descentLighting?.afterglow).toBeCloseTo(1);
  expect(ending.metrics.encoreMeshes).toBe(0);
  await page.keyboard.up('Shift');
  await page.keyboard.down('Shift');
  await page.locator('canvas').screenshot({ path: info.outputPath('impossible-full-boost-exit.png') });
  await expect.poll(() => page.evaluate(() => window.b0Harness.snapshot())).toMatchObject({
    phase: 'results', difficulty: 'impossible', gatesPassed: 189, gatesTotal: 189,
    result: { title: 'ESCAPED', unreached: 0, encore: { missed: 0, neutralized: 0 } },
  });
  await page.keyboard.up('Shift');
  const error = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.getContext('webgl2')!.getError());
  expect(error).toBe(0);
  await page.evaluate(async () => {
    const test = window.b0Harness;
    test.returnToMenu();
    await test.start(true);
  });
  const retry = await page.evaluate(() => window.b0Harness.snapshot());
  expect(retry).toMatchObject({ phase: 'playing', lives: 1, gatesPassed: 0 });
  expect(retry.encore).toBeUndefined();
  await page.evaluate(() => window.b0Harness.dispose());
});

test('DESCENT reaches the score cutoff before showing results and keeps its terminal view behind the UI', async ({ page }, info) => {
  const sim = new Simulation(volumeById('descent'), { align: true });
  sim.start('normal', 0);
  const duration = sim.volume.beats * sim.secondsPerBeat;
  const capture = (time: number) => page.goto(`/?vol=descent&diff=normal&align=1&boost=1&t=${time}&q=high&dbg=1`);
  const diagnostics = page.locator('#errbox');
  const flash = page.locator('#flash');
  await capture(duration - 6);
  await expect(diagnostics).toContainText('"outroPhase":"afterglow"');
  await expect(flash).toHaveCSS('opacity', '0');
  const before = JSON.parse((await diagnostics.textContent())!);
  await capture(duration - 2);
  await expect(diagnostics).toContainText('"outroPhase":"afterglow"');
  await expect(flash).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.5);
  await capture(duration - .25);
  await expect(diagnostics).toContainText('"outroPhase":"afterglow"');
  expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.97);
  await capture(duration + .55);
  await expect(diagnostics).toContainText('"phase":"crash"');
  await expect(diagnostics).toContainText('"beat":384');
  expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.22);
  await capture(duration + 1.7);
  await expect(page.locator('#over-title')).toHaveText('ESCAPED');
  await expect(page.locator('#over')).toContainText('ENCORE BONUS');
  expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(.005);
  const result = JSON.parse((await diagnostics.textContent())!);
  expect(result.trackDistance).toBeGreaterThan(before.trackDistance);
  expect(result.encore).toEqual(before.encore);
  expect(result.descentLighting.afterglow).toBe(1);
  await page.screenshot({ path: info.outputPath('descent-results.png') });

  await page.goto(`/?vol=descent&diff=normal&align=1&t=${duration + .5}&q=high&dbg=1`);
  await expect(diagnostics).toContainText('"outroPhase":"transition"');
  await expect(diagnostics).toContainText('"phase":"crash"');
  expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.9);
  await page.goto(`/?vol=descent&diff=normal&align=1&t=${duration + 1.7}&q=high&dbg=1`);
  await expect(page.locator('#over-title')).toHaveText('ESCAPED');
  await expect(diagnostics).toContainText('"outroPhase":"transition"');
  const cruise = JSON.parse((await diagnostics.textContent())!);
  expect(cruise.trackDistance).toBeLessThan(sim.outroPlan!.gates[0].worldStation - 4);
  expect(cruise.encore).toBeUndefined();
});

test('DESCENT restores the glass scene at the same station and releases it on switch', async ({ page }) => {
  await page.goto('http://127.0.0.1:8090/');
  const streamed = await page.evaluate(() => window.b0Harness.streamResources('descent'));
  expect(streamed.oldChunksRemoved).toBe(true);
  expect(streamed.currentDisposals).toBe(streamed.expectedDisposals);
  expect(streamed.remaining).toBe(0);
  const snapshot = () => page.evaluate(() => window.b0Harness.snapshot());
  const at = await page.evaluate(async () => {
    const test = window.b0Harness;
    await test.mount({ volumeId: 'descent', difficulty: 'impossible', quality: 'low', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post: true, record: false, debug: true,
    } });
    await test.start(true);
    const state = test.advanceAndPause(207);
    await test.resume(true);
    return state;
  });
  expect(at.sharedPath).toBe(true);
  expect(at.metrics.calls).toBeGreaterThan(0);
  const extension = await page.evaluateHandle(() => document.querySelector('canvas')!.getContext('webgl2')!
    .getExtension('WEBGL_lose_context'));
  expect(await extension.evaluate(value => value !== null)).toBe(true);
  await extension.evaluate(value => value!.loseContext());
  await expect.poll(async () => (await snapshot()).pauseReason).toBe('context');
  await extension.evaluate(value => value!.restoreContext());
  await expect.poll(async () => (await snapshot()).phase).toBe('playing');
  const restored = await page.evaluate(() => window.b0Harness.branchState());
  expect(restored.sharedPath).toBe(true);
  expect(restored.trackDistance).toBeGreaterThanOrEqual(at.trackDistance);
  expect(restored.trackDistance - at.trackDistance).toBeLessThan(70);
  // The recovered context only uploads profiles seen from the recovered station.
  expect(restored.metrics.geometries).toBeLessThanOrEqual(at.metrics.geometries + 2);
  expect(restored.metrics.calls).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await window.b0Harness.resume(true);
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
  });
  expect((await snapshot()).progress).toBeLessThan(.01);
  const switched = await page.evaluate(async () => {
    const test = window.b0Harness;
    test.returnToMenu();
    await test.select('daybreak');
    await test.start(true);
    const state = test.branchState();
    test.dispose();
    return state;
  });
  expect(switched.sharedPath).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0);
});
