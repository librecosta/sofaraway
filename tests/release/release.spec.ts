import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { explorerTopics } from '../../app/components/explorer/explorer-paths';

const start = '[data-act=start]';
const runtimeChunk = '**/assets/GameRuntime.client-*.js';
const canonical = 'https://sofaraway.librecosta.com/';
const title = 'SoFarAway — A Procedural Rhythm Runner';
const description = 'Four worlds. Four soundtracks. Thread the gates and ride the beat in a browser rhythm runner with entirely runtime-generated graphics and music. By LibreCosta.';
const socialImage = 'social/orbit-aurora.jpg';
const discovery = ['robots.txt', 'sitemap.xml', 'llms.txt', '.well-known/security.txt', socialImage];

test('static artifact, real 404, MIME and cache validators', async ({ request }) => {
  const html = await request.get('/?vol=orbit');
  expect(html.status()).toBe(200);
  expect(html.headers()['content-type']).toContain('text/html');
  expect(html.headers()['cache-control']).toContain('max-age=0');
  const etag = html.headers()['etag'];
  expect(etag).toBeTruthy();
  expect((await request.get('/?vol=orbit', { headers: { 'If-None-Match': etag } })).status()).toBe(304);
  expect((await request.get('/', { headers: { 'If-None-Match': '"previous-build"' } })).status()).toBe(200);
  expect((await request.head('/index.html')).headers()['etag']).toBe(etag);
  expect((await html.text())).not.toMatch(/<link[^>]+rel="modulepreload"[^>]+GameRuntime/);
  const debug = await request.get('/debug?vol=orbit', { maxRedirects: 0 });
  expect(debug.status()).toBe(308);
  expect(debug.headers()['location']).toBe('/debug/?vol=orbit');
  expect(await (await request.get('/debug/')).text()).toContain('name="robots" content="noindex"');
  const inspector = await request.get('/debug/audio');
  expect(inspector.status()).toBe(200);
  expect(await inspector.text()).toContain('SoFarAway / Audio Inspector');
  expect(await html.text()).not.toMatch(/<link[^>]+rel="modulepreload"[^>]+debug\.audio/);

  for (const topic of [...explorerTopics, 'audio', 'legacy']) {
    const path = `/debug/${topic}`;
    const direct = await request.get(`${path}?vol=orbit&seed=7`, { maxRedirects: 0 });
    expect(direct.status(), path).toBe(308);
    expect(direct.headers()['location'], path).toBe(`${path}/?vol=orbit&seed=7`);
    const page = await request.get(`${path}/?vol=orbit&seed=7`);
    expect(page.status(), path).toBe(200);
    expect(await page.text(), path).toContain('name="robots" content="noindex"');
  }

  for (const path of ['/missing', '/missing/nested/', '/assets/obsolete-abcdef99.js', '/__spa-fallback.html']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
    expect(response.headers()['content-type'], path).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('Page not found');
    expect(body).toContain('<a href="/">Back to SoFarAway</a>');
    expect(response.headers()['cache-control'], path).toContain('max-age=0');
  }

  const files = (await readdir('build/client', { recursive: true, withFileTypes: true }))
    .filter(file => file.isFile())
    .map(file => relative('build/client', file.parentPath + '/' + file.name).replaceAll('\\', '/'));
  expect(files).toEqual(expect.arrayContaining(['index.html', '404.html', 'favicon.svg', 'debug/index.html', 'debug/audio/index.html', 'tools/render-audio.html',
    'THIRD-PARTY-NOTICES.txt', 'licenses/SoFaraway.txt', 'licenses/OFL-Chakra-Petch.txt', 'licenses/OFL-Rajdhani.txt', ...discovery]));
  expect(await readFile('build/client/licenses/SoFaraway.txt', 'utf8')).toBe(await readFile('LICENSE', 'utf8'));
  const fingerprinted = /^assets\/[\w.-]+-[\w-]{8,}\.(?:js|css|woff2)$/;
  const metadata = new Set(['index.html', '404.html', 'favicon.svg', 'debug/index.html', 'debug/audio/index.html', 'tools/render-audio.html',
    'THIRD-PARTY-NOTICES.txt', 'licenses/SoFaraway.txt', 'licenses/OFL-Chakra-Petch.txt', 'licenses/OFL-Rajdhani.txt',
    ...[...explorerTopics, 'legacy'].map(topic => `debug/${topic}/index.html`),
    ...['elsewhere', 'daybreak', 'descent', 'orbit'].map(volume => `explorer/${volume}.webp`), '_headers', 'edgeone.json', ...discovery]);
  expect(files.filter(path => !fingerprinted.test(path) && !metadata.has(path))).toEqual([]);
  const assets = files.filter(path => fingerprinted.test(path)).map(path => '/' + path).sort();
  const immutable = 'public, max-age=31536000, immutable';
  const revalidate = 'public, max-age=0, must-revalidate';
  const mutable = [
    '/', '/index.html', '/404.html', '/404', '/debug', '/debug/*',
    '/explorer/*', '/licenses/*', '/tools/*', '/social/*',
    '/favicon.svg', '/robots.txt', '/sitemap.xml', '/llms.txt', '/.well-known/security.txt', '/THIRD-PARTY-NOTICES.txt',
  ];
  expect(assets.length + mutable.length).toBeLessThanOrEqual(100);
  expect(await readFile('build/client/_headers', 'utf8')).toBe(
    [...mutable.map(path => `${path}\n  Cache-Control: ${revalidate}\n`),
      ...assets.map(path => `${path}\n  Cache-Control: ${immutable}\n`)].join(''));
  expect(JSON.parse(await readFile('build/client/edgeone.json', 'utf8'))).toEqual({
    headers: mutable.map(source => ({ source, headers: [{ key: 'Cache-Control', value: revalidate }] })),
  });
  expect(mutable.length).toBeLessThanOrEqual(30);
  const mime = { js: /javascript/, css: /text\/css/, woff2: /font\/woff2/, html: /text\/html/, svg: /image\/svg\+xml/,
    webp: /image\/webp/, jpg: /image\/jpeg/, txt: /text\/plain/, xml: /application\/xml/ };
  for (const path of files) {
    if (path === '_headers' || path === 'edgeone.json') continue;
    const ext = path.split('.').at(-1) as keyof typeof mime;
    const response = await request.head('/' + path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toMatch(mime[ext]);
    expect(response.headers()['cache-control'], path).toBe(fingerprinted.test(path) ? immutable : revalidate);
    if (ext === 'js') expect(await readFile('build/client/' + path, 'utf8')).not.toMatch(
      /window\.(?:b0Harness|stability|syncHarness)|__shaderHandles|__startupSample/);
  }
});

test('crawl directives and public disclosure files match the indexable routes', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/^User-agent: \*$/m);
  expect(robots).toMatch(/^Disallow:[ \t]*$/m);
  expect(robots).not.toMatch(/^Disallow:[ \t]*\S/m);
  expect(robots).toContain(`Sitemap: ${canonical}sitemap.xml`);

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  expect(Array.from(sitemap.matchAll(/<loc>(.*?)<\/loc>/g), ([, loc]) => loc)).toEqual([canonical]);
  const homepage = await (await request.get('/')).text();
  expect(homepage).not.toMatch(/<meta[^>]*name="robots"[^>]*noindex/);

  const llms = await (await request.get('/llms.txt')).text();
  expect(llms).toMatch(/^# SoFarAway\r?\n/);
  expect(llms).toContain(`[Play SoFarAway](${canonical})`);
  expect(llms).toContain(`[Technical Explorer](${canonical}debug/)`);

  const security = await request.get('/.well-known/security.txt');
  expect(security.status()).toBe(200);
  expect(security.headers()['content-type']).toContain('text/plain');
  const report = await security.text();
  expect(report).toMatch(/^Contact: mailto:contact@librecosta\.com\r?$/m);
  const expiry = /^Expires: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\r?$/gm;
  const dates = Array.from(report.matchAll(expiry), ([, date]) => date);
  expect(dates).toHaveLength(1);
  expect(Date.parse(dates[0])).toBeGreaterThan(Date.now());
});

test('prerendered metadata and visible fallback without scripting', async ({ browser, baseURL }) => {
  const page = await browser.newPage({ baseURL, javaScriptEnabled: false });
  try {
    await page.goto('/?vol=orbit');
    await expect(page).toHaveTitle(title);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'SoFarAway' })).toBeVisible();
    await expect(page.getByText('PROCEDURAL RUNNER', { exact: true })).toBeVisible();
    await expect(page.getByText('MUSIC IN MOTION', { exact: true })).toBeVisible();
    await expect(page.getByText(/enable JavaScript/i)).toBeVisible();
    await expect(page.getByText('INITIALIZING', { exact: true })).toBeHidden();
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', canonical);
    await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', '/favicon.svg');
    for (const [attribute, key, value] of [
      ['name', 'description', description],
      ['property', 'og:url', canonical], ['property', 'og:type', 'website'],
      ['property', 'og:title', title], ['property', 'og:description', description],
      ['property', 'og:site_name', 'SoFarAway'], ['property', 'og:image', canonical + socialImage],
      ['property', 'og:image:type', 'image/jpeg'], ['property', 'og:image:width', '1200'],
      ['property', 'og:image:height', '630'], ['property', 'og:image:alt', /AURORA/],
      ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', title],
      ['name', 'twitter:description', description], ['name', 'twitter:image', canonical + socialImage],
      ['name', 'twitter:image:alt', /AURORA/],
    ] as const) await expect(page.locator(`meta[${attribute}="${key}"]`)).toHaveAttribute('content', value);
    await page.goto('/' + socialImage);
    const size = await page.locator('img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
    expect(size).toEqual([1200, 630]);
  } finally { await page.close(); }
});

test('hydration loads the game on demand and keeps volume history working', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let allowDownload!: () => void;
  let observeRequest!: () => void;
  const download = new Promise<void>(resolve => { allowDownload = resolve; });
  const requested = new Promise<void>(resolve => { observeRequest = resolve; });
  await page.route(runtimeChunk, async route => {
    observeRequest();
    await download;
    await route.continue();
  });
  try {
    await page.goto('/?vol=elsewhere&q=low', { waitUntil: 'domcontentloaded' });
    await requested;
    await expect(page.locator(start)).toBeDisabled();
    await expect(page.locator(start)).toHaveText('INITIALIZING');
  } finally {
    allowDownload();
  }
  const name = page.locator('#vol-name');
  await expect(page.locator(start)).toBeEnabled();
  await expect(name).toContainText('ELSEWHERE');

  for (const volume of ['daybreak', 'descent']) {
    await page.goto('/?vol=' + volume + '&q=low');
    await expect(page.locator(start)).toBeEnabled();
    await expect(name).toContainText(volume.toUpperCase());
  }
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(page).toHaveURL(/vol=orbit/);
  await expect(name).toContainText('ORBIT');
  await page.goBack();
  await expect(name).toContainText('DESCENT');
  await page.goForward();
  await expect(name).toContainText('ORBIT');
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(name).toContainText('ELSEWHERE');
  await page.reload();
  await expect(page.locator(start)).toBeEnabled();
  await expect(name).toContainText('ELSEWHERE');

  const fullscreen = page.getByRole('button', { name: 'FULL SCREEN' });
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await fullscreen.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);

  await page.locator(start).click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('p');
  const paused = page.getByRole('dialog', { name: 'PAUSED' });
  await paused.getByRole('button', { name: 'RESUME' }).click();
  await expect(paused).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator(start)).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a failed runtime download can be retried from the fallback', async ({ page }) => {
  let attempts = 0;
  let available = false;
  await page.route(runtimeChunk, route => {
    attempts++;
    return available ? route.continue() : route.abort();
  });
  await page.goto('/?vol=descent&q=low');
  const fallback = page.getByRole('dialog', { name: 'GAME UNAVAILABLE' });
  await expect(fallback).toBeVisible();
  const failedAttempts = attempts;
  expect(failedAttempts).toBeGreaterThan(0);
  available = true;
  await fallback.getByRole('button', { name: 'TRY AGAIN' }).click();
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('#vol-name')).toContainText('DESCENT');
  expect(attempts).toBeGreaterThan(failedAttempts);
});

test('missing WebGL2 keeps a usable fallback and Retry can recover', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    let available = false;
    document.addEventListener('release-allow-webgl', () => { available = true; }, { once: true });
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...options: unknown[]) {
      return type === 'webgl2' && !available ? null : Reflect.apply(original, this, [type, ...options]);
    } as typeof original;
  });
  await page.goto('/?vol=daybreak&q=low');
  const dialog = page.getByRole('dialog', { name: 'GRAPHICS UNSUPPORTED' });
  const retry = dialog.getByRole('button', { name: 'TRY AGAIN' });
  await expect(dialog.getByRole('alert')).toContainText(/WebGL2/i);
  await expect(retry).toBeFocused();
  await expect(retry).not.toHaveCSS('cursor', 'none');
  await expect(page.locator('#cursor')).toBeHidden();
  await page.evaluate(() => document.dispatchEvent(new Event('release-allow-webgl')));
  await retry.click();
  await expect(page.locator(start)).toBeEnabled();
  await expect(page.locator('#vol-name')).toContainText('DAYBREAK');
  await expect(page.locator('canvas#gl')).toHaveCount(1);
});

test('unsupported Fullscreen reports a visible status', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined });
  });
  await page.goto('/?q=low');
  await expect(page.locator(start)).toBeEnabled();
  await page.getByRole('button', { name: 'FULL SCREEN' }).click();
  await expect(page.locator('#menu').getByRole('status')).toHaveText('FULL SCREEN UNAVAILABLE');
});
