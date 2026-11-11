import { expect, test } from '@playwright/test';
import { branchLayout } from '../../app/game/core/branches';
import type {} from '../harness/main';

const harnessUrl = 'http://127.0.0.1:8090/';
const fixed = (beat: number, route = 'center', boost = false) =>
  `/?vol=elsewhere&t=${beat * 60 / 128}&q=low&align=1&god=0&dbg=1&route=${route}&boost=${Number(boost)}`;

test('the live junction has visible labelled mouths, route-local gates and bounded GPU ownership', async ({ page }) => {
  await page.goto(harnessUrl);
  const { samples, resets, disposals, textureDisposals, materialDisposals } = await page.evaluate(() => window.b0Harness.inspectJunction());
  for (const [index, sample] of samples.entries()) {
    if (index < 3) console.log('JUNCTION ' + JSON.stringify({
      seed: sample.seed, boost: sample.boost, setupMs: sample.setupMs,
      preview: sample.previewBeforeChoice, before: sample.before, during: sample.during, after: sample.after,
    }));
    expect(sample.previewBeforeChoice.some(frame => frame.visible.length === 3), JSON.stringify(sample)).toBe(true);
    const visible = sample.previewBeforeChoice.find(frame => frame.visible.length === 3)!;
    expect(visible.visible).toEqual(sample.names);
    expect(sample.activeGates.length).toBeGreaterThan(0);
    expect(new Set(sample.activeGates)).toEqual(new Set([sample.route]));
    expect(Math.max(...sample.gateErrors)).toBeLessThan(1e-6);
    expect([sample.before.junctionMeshes, sample.during.junctionMeshes, sample.after.junctionMeshes]).toEqual([0, 5, 0]);
    expect(sample.released).toBe(true);
    expect(sample.glError).toBe(0);
  }
  expect([disposals, textureDisposals, materialDisposals]).toEqual([45, 27, 36]);
  // Renderer.info counts uploaded chunk meshes; compare repeat samples of the same speed/approach.
  expect(resets.slice(6)).toEqual(resets.slice(3, 6));
  expect(resets.every(reset => reset.junctionMeshes === 0 && reset.textures === resets[0].textures)).toBe(true);
});

test('fixed time reproduces the junction view and all route results', async ({ page }) => {
  await page.goto(fixed(319.9));
  const layout = branchLayout(0);
  await expect(page.locator('#route-hint')).toHaveText(`Steer left for ${layout.left}, straight for main, or right for ${layout.right}.`);
  const capture = async () => {
    await page.addStyleTag({ content: '#ui, #cursor, #errbox { display:none!important; }' });
    return page.locator('#gl').screenshot();
  };
  const image = await capture();
  await page.reload();
  await expect(page.locator('#route-hint')).toHaveCount(1);
  expect((await capture()).equals(image)).toBe(true);

  const count = { main: 141, challenge: 145, score: 157 };
  const scores = { main: 105326, challenge: 118126, score: 111406 };
  for (const side of ['left', 'center', 'right'] as const) {
    const route = layout[side];
    await page.goto(fixed(450, side));
    await expect(page.locator('#over-title')).toHaveText('ESCAPED');
    await expect(page.locator('#over-route')).toHaveText(route.toUpperCase() + ' ROUTE');
    await expect(page.locator('#over-acc')).toHaveText('100%');
    await expect(page.locator('#over-gates')).toHaveText(`${count[route]}/${count[route]}`);
    await expect(page.locator('#over-score')).toHaveText(String(scores[route]));
  }
});

test('three horizontal holograms keep their outlines while their interiors move', async ({ page }) => {
  await page.goto(harnessUrl);
  const checks = await page.evaluate(() => window.b0Harness.inspectHologram());
  for (const { frames, glError, released } of checks) {
    expect(frames.map(frame => frame.holograms)).toEqual([0, 3, 3, 0]);
    expect(frames[1].labels).toEqual(['score', 'main', 'challenge']);
    expect(frames[2].labels).toEqual(frames[1].labels);
    expect(frames[1].bounds).toEqual(frames[2].bounds);
    expect(frames[2].selected).toBe('right');
    expect(frames[2].gatesJudged).toBe(94);
    expect(frames[2].pixels).toBeGreaterThan(100);
    expect(frames[2].movingPixels).toBeGreaterThan(50);
    expect(frames[2].stablePixels).toBeGreaterThan(100);
    expect(frames[2].bounds).toHaveLength(6);
    for (const { minX, maxX, minY, maxY, thickness, up } of frames[2].bounds) {
      expect(minX).toBeGreaterThan(-0.98);
      expect(maxX).toBeLessThan(0.98);
      expect(minY).toBeGreaterThan(-1);
      expect(maxY).toBeLessThan(0);
      expect(thickness).toBeGreaterThan(0.08);
      expect(up).toBeGreaterThan(0.999);
    }
    expect(glError).toBe(0);
    expect(released).toBe(6);
  }
  await page.goto(fixed(322.4, 'right', true));
  await expect(page.locator('#route-hint')).toHaveText('Entering challenge route.');
  await page.goto(fixed(323.2, 'right', true));
  await expect(page.locator('#hud-route')).toHaveText('CHALLENGE');
  await expect(page.locator('#route-hint')).toHaveCount(0);
});

test('a locked branch survives pause, WebGL loss and BFCache then resets on restart', async ({ page }) => {
  await page.goto(harnessUrl);
  const locked = await page.evaluate(async () => {
    await window.b0Harness.mount({ runSeed: 0, quality: 'low', diagnostics: {
      fixedTime: null, autoplay: false, god: false, align: true, boost: false,
      mobileQuality: false, post: true, record: false, debug: true, branchSide: 'right',
    } });
    await window.b0Harness.start(true);
    return window.b0Harness.advanceAndPause(329);
  });
  expect(locked.branch?.side).toBe('right');
  expect(locked.metrics.junctionMeshes).toBe(5);
  const snapshot = () => page.evaluate(() => window.b0Harness.snapshot());
  expect((await snapshot()).phase).toBe('paused');
  const supported = await page.evaluate(() => {
    const ext = document.querySelector('canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    window.addEventListener('restore-test-context', () => ext.restoreContext(), { once: true });
    ext.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await expect.poll(async () => (await snapshot()).error?.kind).toBe('graphics');
  await page.evaluate(() => window.dispatchEvent(new Event('restore-test-context')));
  await expect.poll(async () => (await snapshot()).error).toBeNull();
  expect((await snapshot()).pauseReason).toBe('user');
  const after = await page.evaluate(() => window.b0Harness.branchState());
  expect(after.branch).toEqual(locked.branch);
  expect(after.metrics.junctionMeshes).toBe(5);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  expect((await snapshot()).phase).toBe('paused');
  await page.evaluate(() => window.b0Harness.resume(true));
  await expect.poll(async () => (await snapshot()).phase).toBe('playing');
  const exited = await page.evaluate(async () => {
    const merged = window.b0Harness.advanceAndPause(361);
    window.b0Harness.returnToMenu();
    await window.b0Harness.start(true);
    const next = window.b0Harness.branchState();
    const abandoned = window.b0Harness.advanceAndPause(329);
    window.b0Harness.returnToMenu();
    await window.b0Harness.select('drift');
    const switched = window.b0Harness.branchState();
    window.b0Harness.dispose();
    return { merged, next, abandoned, switched };
  });
  expect(exited.merged.branch?.side).toBe('right');
  expect(exited.merged.metrics.junctionMeshes).toBe(0);
  expect(exited.next.branch?.layout).toEqual(locked.branch?.layout);
  expect(exited.next.branch?.side).toBeNull();
  expect(exited.abandoned.metrics.junctionMeshes).toBe(5);
  expect(exited.switched.branch).toBeNull();
  expect(exited.switched.metrics.junctionMeshes).toBe(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});
