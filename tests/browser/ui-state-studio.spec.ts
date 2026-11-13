import { expect, test } from '@playwright/test';

test('UI State Studio renders production states, stays scrollable and never writes settings or scores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('sofaraway.records.v1', '{"version":1,"standard":{},"sightseeing":{}}');
    localStorage.setItem('sofaraway.dynamicLights', 'false');
  });
  await page.goto('/debug/#ui-states');
  const studio = page.locator('#ui-states');
  const scenario = studio.getByLabel('Scenario');
  const iframe = studio.locator('iframe');
  const frame = studio.frameLocator('iframe');
  await expect(page.getByRole('link', { name: 'UI States' })).toHaveAttribute('href', '#ui-states');
  await expect(studio.getByRole('heading', { name: 'UI State Studio' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'SOFARAWAY' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight * 2)).toBe(true);
  await expect(frame.getByText('PROCEDURAL RUNNER')).toBeVisible();
  await expect(frame.getByText('MUSIC IN MOTION')).toBeVisible();
  await frame.getByRole('link', { name: 'SoFaraway on GitHub' }).click();
  expect(page.context().pages()).toHaveLength(1);
  await scenario.focus();
  await expect(frame.locator('#menu')).toHaveCSS('font-family', /Rajdhani/);
  await expect(frame.getByRole('group', { name: 'Local records' })).toContainText(/BEST SCORE\s*—/);
  await scenario.selectOption('record-failure');
  await expect(frame.getByRole('group', { name: 'Local records' })).toContainText('TERMINATED');
  await scenario.selectOption('record-success');
  await expect(frame.getByRole('group', { name: 'Local records' })).toContainText('372,231');

  for (const [id, title, text, status] of [
    ['pause-user', 'PAUSED', 'Your run is paused', false],
    ['pause-background', 'PAUSED', 'left the foreground', false],
    ['pause-context', 'PAUSED', 'Graphics were interrupted', false],
    ['audio-start', 'AUDIO UNAVAILABLE', 'Audio could not start', false],
    ['unsupported', 'GRAPHICS UNSUPPORTED', 'WebGL2', false],
    ['graphics-init', 'GRAPHICS UNAVAILABLE', 'graphics resource', false],
    ['context-pending', '', 'Waiting for WebGL', true],
    ['context-failed', 'GRAPHICS RECOVERY FAILED', 'WebGL did not recover', false],
    ['runtime-error', 'GAME UNAVAILABLE', 'The game could not load', false],
  ] as const) {
    await scenario.selectOption(id);
    const shown = status ? frame.getByRole('status').filter({ hasText: text }) : frame.getByRole('dialog', { name: title });
    await expect(shown).toContainText(text);
    if (status) await expect(frame.getByRole('dialog')).toHaveCount(0);
    else await expect(studio.locator('iframe')).not.toBeFocused();
  }
  await scenario.selectOption('audio-unavailable');
  await iframe.scrollIntoViewIfNeeded();
  await frame.getByRole('button', { name: 'SOUND OFF · RESTORE AUDIO' }).click();
  await expect(frame.getByRole('button', { name: 'SOUND OFF · RESTORE AUDIO' })).toHaveCount(0);

  for (const [id, content] of [['escaped-s', 'S'], ['escaped-a','A'], ['escaped-b','B'], ['escaped-c','C']] as const) {
    await scenario.selectOption(id);
    await expect(frame.locator('#over-title')).toHaveText('ESCAPED');
    await expect(frame.locator('#over-rank')).toHaveText(content);
  }
  await scenario.selectOption('terminated');
  await expect(frame.locator('#over-title')).toHaveText('TERMINATED');
  await scenario.selectOption('encore-partial');
  await expect(frame.getByText('ENCORE BONUS')).toBeVisible();
  await expect(frame.getByText('7/10')).toBeVisible();
  await scenario.selectOption('sightseeing-complete');
  await expect(frame.locator('#over-mode')).toHaveText('SIGHTSEEING');
  await expect(frame.getByText('ENCORE BONUS')).toHaveCount(0);

  await scenario.selectOption('settings-quality-disabled');
  await expect(frame.getByRole('button', { name: 'HIGH' })).toBeDisabled();
  await scenario.selectOption('settings');
  await iframe.scrollIntoViewIfNeeded();
  await frame.getByRole('button', { name: 'HIGH' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(frame.getByRole('button', { name: 'LOW' })).toHaveAttribute('aria-pressed', 'true');
  await frame.getByRole('switch', { name: 'DYNAMIC LIGHTS' }).check();
  await frame.getByRole('button', { name: 'CLOSE' }).click();
  await expect(frame.getByRole('button', { name: 'Dynamic lights', exact: true })).toHaveCount(0);
  await frame.getByRole('button', { name: 'SETTINGS' }).click();
  await expect(frame.getByRole('switch', { name: 'DYNAMIC LIGHTS' })).toBeChecked();
  await scenario.selectOption('credits');
  await expect(frame.getByRole('link', { name: 'librecosta', exact: true })).toBeVisible();
  const helloRun = frame.getByRole('link', { name: 'HelloRun' });
  await expect(helloRun).not.toHaveAttribute('href');
  await iframe.scrollIntoViewIfNeeded();
  await helloRun.click();
  expect(page.context().pages()).toHaveLength(1);
  await scenario.selectOption('music-open');
  await iframe.scrollIntoViewIfNeeded();
  await expect(frame.getByRole('tooltip')).toContainText('128 BPM');
  await frame.getByRole('button', { name: 'Sound', exact: true }).press('Escape');
  await expect(frame.getByRole('tooltip')).toBeHidden();

  await scenario.selectOption('share-success');
  await iframe.scrollIntoViewIfNeeded();
  await expect(frame.getByText('LINK COPIED')).toBeVisible();
  await frame.getByRole('button', { name: 'SHARE' }).click();
  await expect(frame.getByText('LINK COPIED')).toHaveCount(1);
  await scenario.selectOption('share-failure');
  await expect(frame.getByText('COULD NOT COPY LINK')).toBeVisible();
  await studio.getByRole('button', { name: 'Close preview' }).click();
  await expect(studio.locator('iframe')).toHaveCount(0);
  await studio.getByRole('button', { name: 'Open preview' }).click();
  await expect(frame.getByRole('heading', { name: 'SOFARAWAY' })).toBeVisible();
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual({
    'sofaraway.dynamicLights': 'false',
    'sofaraway.records.v1': '{"version":1,"standard":{},"sightseeing":{}}',
  });
  expect(errors).toEqual([]);
});

test('Studio uses the requested browser viewport and keeps one corridor canvas across scenario changes', async ({ page }) => {
  await page.goto('/debug/#ui-states');
  const studio = page.locator('#ui-states');
  const scenario = studio.getByLabel('Scenario');
  const viewport = studio.getByLabel('Preview viewport');
  const iframe = studio.locator('iframe');
  const frame = studio.frameLocator('iframe');
  for (const [index, [width,height]] of [[1920,1080], [1280,720], [960,540], [390,844], [320,568], [667,375]].entries()) {
    await viewport.selectOption(String(index));
    await iframe.scrollIntoViewIfNeeded();
    const sizes = await frame.locator('body').evaluate(el => [el.ownerDocument.defaultView!.innerWidth, el.ownerDocument.defaultView!.innerHeight]);
    expect(sizes).toEqual([width,height]);
    const wordmark = await frame.getByRole('heading', { name: 'SOFARAWAY' }).evaluate(el => el.getBoundingClientRect().toJSON());
    expect(wordmark.left).toBeGreaterThanOrEqual(0);
    expect(wordmark.right).toBeLessThanOrEqual(width);
    await expect(frame.getByRole('button', { name: 'START · PRESS X' })).toBeEnabled();
    await frame.getByRole('button', { name: 'Sound', exact: true }).hover();
    const music = await frame.getByRole('tooltip').evaluate(el => el.getBoundingClientRect().toJSON());
    expect(music.right).toBeLessThanOrEqual(width);
    await frame.getByRole('button', { name: 'Sound', exact: true }).press('Escape');
    await frame.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(frame.getByRole('switch', { name: 'DYNAMIC LIGHTS' })).toBeEnabled();
    await frame.getByRole('button', { name: 'CLOSE' }).click();
  }
  await scenario.selectOption('long-error');
  expect(await frame.getByRole('alert').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await scenario.selectOption('landscape-results');
  await expect(frame.getByText('TOTAL SCORE')).toBeVisible();
  const back = frame.getByRole('button', { name: 'BACK TO MENU' });
  expect(await back.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(375);

  await studio.getByLabel('Real corridor background').check();
  await expect(studio.getByRole('status')).toHaveText('Rendered game corridor');
  const canvas = await frame.locator('#gl').elementHandle();
  await canvas!.evaluate(el => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_lose_context')!;
    const lose = ext.loseContext.bind(ext);
    const root = el.ownerDocument.defaultView!.parent.document.documentElement;
    ext.loseContext = () => { root.dataset.studioReleased = 'true'; lose(); };
  });
  await scenario.selectOption('drift');
  await expect(frame.locator('#vol-name')).toContainText('DRIFT');
  await scenario.selectOption('pause-user');
  expect(await canvas!.evaluate(el => el === el.ownerDocument.querySelector('#gl'))).toBe(true);
  await studio.getByRole('button', { name: 'Close preview' }).click();
  await expect(studio.locator('iframe')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-studio-released', 'true');
});
