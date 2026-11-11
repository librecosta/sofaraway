import { expect, test } from '@playwright/test';
import { readMetrics } from '../diagnostics';
import { fallback, ready, record, startButton } from './support';

test('insufficient texture limits are distinct from a missing WebGL2 context', async ({ page }, info) => {
  await page.addInitScript(() => {
    if (typeof WebGL2RenderingContext === 'undefined') return;
    const proto = WebGL2RenderingContext.prototype;
    const getParameter = proto.getParameter;
    proto.getParameter = function (name) {
      return name === this.MAX_TEXTURE_SIZE ? 512 : getParameter.call(this, name);
    };
  });
  await page.goto('/');
  if (!await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))) {
    await expect(fallback(page)).toContainText('WebGL2');
    record(info, 'BLOCKED', 'Cannot simulate low limits without WebGL2');
    return;
  }
  await expect(fallback(page)).toContainText('WebGL2 limits are too low');
  await expect(startButton(page)).toBeDisabled();
  record(info, 'UNSUPPORTED', 'WebGL2 context present but required procedural textures exceed the device limit');
});

test('missing WebGL2 shows an actionable fallback', async ({ page }, info) => {
  await page.addInitScript(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        return type === 'webgl2' ? null : Reflect.apply(native, this, [type, ...args]);
      },
    });
  });
  await page.goto('/');
  await expect(fallback(page)).toContainText('WebGL2');
  await expect(fallback(page).getByRole('button', { name: 'TRY AGAIN' })).toBeEnabled();
  await expect(startButton(page)).toBeDisabled();
  record(info, 'UNSUPPORTED', 'Injected missing WebGL2; fallback visible and start blocked');
});

for (const failure of ['float-extension', 'float-framebuffer', 'msaa', 'all-framebuffers', 'resize-framebuffer'] as const) {
  test(`graphics survives ${failure} failure`, async ({ page }, info) => {
    await page.addInitScript(failure => {
      if (typeof WebGL2RenderingContext === 'undefined') return;
      const p = WebGL2RenderingContext.prototype;
      const getExtension = p.getExtension;
      const check = p.checkFramebufferStatus;
      const texture = p.texStorage2D;
      const image = p.texImage2D;
      const multisample = p.renderbufferStorageMultisample;
      const types = new WeakMap<WebGLTexture, number>();
      const samples = new WeakMap<WebGLRenderbuffer, number>();
      let rejectResizedFloat = false;
      window.addEventListener('compat-incomplete-framebuffer', () => { rejectResizedFloat = true; });
      p.getExtension = function (name: string) {
        if (failure === 'float-extension' && name === 'EXT_color_buffer_float') return null;
        return Reflect.apply(getExtension, this, [name]);
      };
      p.texStorage2D = function (target, levels, internalFormat, width, height) {
        const bound = this.getParameter(this.TEXTURE_BINDING_2D);
        if (bound && target === this.TEXTURE_2D) types.set(bound, internalFormat);
        texture.call(this, target, levels, internalFormat, width, height);
      };
      p.texImage2D = function (target: number, level: number, internalFormat: number, ...args: unknown[]) {
        const bound = this.getParameter(this.TEXTURE_BINDING_2D);
        if (bound && target === this.TEXTURE_2D) types.set(bound, internalFormat);
        Reflect.apply(image, this, [target, level, internalFormat, ...args]);
      };
      p.renderbufferStorageMultisample = function (target, count, format, width, height) {
        const bound = this.getParameter(this.RENDERBUFFER_BINDING);
        if (bound) samples.set(bound, count);
        multisample.call(this, target, count, format, width, height);
      };
      p.checkFramebufferStatus = function (target) {
        const status = check.call(this, target);
        if (status !== this.FRAMEBUFFER_COMPLETE || !this.getParameter(this.DRAW_FRAMEBUFFER_BINDING)) return status;
        const color = this.getFramebufferAttachmentParameter(target, this.COLOR_ATTACHMENT0, this.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME);
        if (failure === 'all-framebuffers' ||
          ((failure === 'float-framebuffer' || rejectResizedFloat) && types.get(color) === this.RGBA16F) ||
          (failure === 'msaa' && (samples.get(color) ?? 0) > 0)) return this.FRAMEBUFFER_UNSUPPORTED;
        return status;
      };
    }, failure);
    if (!await ready(page, info, '/?q=high&dbg=1')) return;
    await expect(page.locator('#errbox')).toHaveText(/"phase":"menu"/);
    if (failure === 'resize-framebuffer') {
      const size = page.viewportSize()!;
      await page.evaluate(() => window.dispatchEvent(new Event('compat-incomplete-framebuffer')));
      await page.setViewportSize({ width: size.width - 17, height: size.height - 13 });
      await expect.poll(async () => (await readMetrics(page)).colorTarget).toBe('rgba8');
    }
    const metrics = await readMetrics(page);
    expect(metrics.calls).toBeGreaterThan(1);
    if (failure === 'all-framebuffers') {
      expect(metrics.targets).toEqual([]);
      expect(metrics.postFailure).toMatch(/framebuffer/i);
    } else {
      expect(metrics.targets.length).toBeGreaterThan(0);
      if (failure === 'msaa') expect(metrics.targets[0][2]).toBe(0);
      else {
        expect(metrics.dof).toBe(false);
        expect(metrics.colorTarget).toBe('rgba8');
      }
    }
    expect(await page.locator('canvas#gl').evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext('webgl2')!.getError())).toBe(0);
    record(info, 'DEGRADED', failure, { targets: metrics.targets, dof: metrics.dof });
  });
}

test('DPR media changes resize the canvas and targets without a window resize', async ({ page }, info) => {
  await page.addInitScript(() => {
    const match = window.matchMedia.bind(window);
    let resolution: MediaQueryList | undefined;
    window.matchMedia = query => {
      const result = match(query);
      if (query.startsWith('(resolution:')) resolution = result;
      return result;
    };
    window.addEventListener('compat-dpr', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 0.75, configurable: true });
      resolution?.dispatchEvent(new Event('change'));
    });
  });
  if (!await ready(page, info, '/?q=high&dbg=1')) return;
  await expect(page.locator('#errbox')).toHaveText(/"phase":"menu"/);
  await page.evaluate(() => window.dispatchEvent(new Event('compat-dpr')));
  await expect.poll(async () => (await readMetrics(page)).dpr).toBe(0.75);
  const metrics = await readMetrics(page);
  expect(metrics.targets[0].slice(0, 2)).toEqual(metrics.canvas);
  expect(metrics.canvas).toEqual(await page.evaluate(() => [Math.floor(innerWidth * 0.75), Math.floor(innerHeight * 0.75)]));
  record(info, 'PASS', 'DPR-only media query change updated canvas and PostFX together');
});

test('actual gate shader pixels agree with collision on this engine', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:8093/');
  const available = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  if (!available) {
    record(info, 'BLOCKED', 'No WebGL2 for GPU pixel readback');
    return;
  }
  for (const id of ['elsewhere', 'drift', 'descent', 'orbit'] as const) {
    const result = await page.evaluate(id => window.b0Harness.shaderMismatches(id), id);
    expect(result, id).toEqual({ mismatches: [], glError: 0 });
  }
  record(info, 'PASS', 'All six gate kinds match collision at measured openings and seams');
});

for (const scope of ['core', 'post'] as const) {
  test(`a ${scope} shader failure has a visible outcome`, async ({ page }, info) => {
    await page.addInitScript(scope => {
      if (typeof WebGL2RenderingContext === 'undefined') return;
      const p = WebGL2RenderingContext.prototype;
      const shaderSource = p.shaderSource;
      p.shaderSource = function (shader, source) {
        const target = scope === 'core' ? 'uniform float uOpen;' : 'uniform sampler2D tBloom;';
        const fragment = this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER;
        if (fragment && source.includes(target)) {
          source = scope === 'core' ? source + '\nerror_compat_test' : source
            .replace('varying vec2 vUv;', 'varying vec3 vUv;')
            .replace('vec2 uv = vUv;', 'vec2 uv = vUv.xy;');
        }
        shaderSource.call(this, shader, source);
      };
    }, scope);
    await page.goto('/?q=high&dbg=1');
    const hasWebGL = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    if (!hasWebGL) {
      await expect(fallback(page)).toContainText('WebGL2');
      record(info, 'BLOCKED', 'No WebGL2 for shader failure injection');
      return;
    }
    if (scope === 'core') {
      await expect(fallback(page)).toContainText('shader could not compile');
      await expect(startButton(page)).toBeDisabled();
      record(info, 'UNSUPPORTED', 'Core shader compilation/linking failed with usable WebGL2');
    } else {
      await expect(startButton(page)).toBeEnabled();
      await expect(page.locator('#errbox')).toHaveText(/"targets":\[\].*shader could not link/);
      record(info, 'DEGRADED', 'PostFX shader failure left the core scene visible');
    }
  });
}
