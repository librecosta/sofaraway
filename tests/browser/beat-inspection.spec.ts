import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const regions = {
  strip: [.673, .511, .723, .566],
  wall: [.77, .25, .91, .42],
  glass: [.489, .372, .56, .419],
};

async function luminance(page: Page, shot: Buffer) {
  return page.evaluate(async ({ encoded, regions }) => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob());
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const linear = Array.from({ length: 256 }, (_, value) => {
      const v = value / 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    const measure = (x0: number, y0: number, x1: number, y1: number) => {
      const x = Math.round(x0 * width), y = Math.round(y0 * height);
      const data = context.getImageData(x, y, Math.round(x1 * width) - x, Math.round(y1 * height) - y).data;
      let total = 0, clipped = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += .2126 * linear[data[i]] + .7152 * linear[data[i + 1]] + .0722 * linear[data[i + 2]];
        if (Math.min(data[i], data[i + 1], data[i + 2]) >= 250) clipped++;
      }
      return { y: total * 4 / data.length, clipped: clipped * 4 / data.length };
    };
    return { strip: measure(...regions.strip as [number, number, number, number]),
      wall: measure(...regions.wall as [number, number, number, number]),
      glass: measure(...regions.glass as [number, number, number, number]), frame: measure(0, 0, 1, 1) };
  }, { encoded: shot.toString('base64'), regions });
}

async function seek(beatControl: Locator, beat: number) {
  await beatControl.fill(String(Number(beat.toFixed(4))));
}

test('beat inspection renders DROP contrast and a quieter BREAK at a fixed station', async ({ browser }, info) => {
  for (const [quality, dpr] of [['high', 1], ['high', 2], ['low', 2]] as const) {
    const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto('http://127.0.0.1:8089/debug/#beat-inspection');
      const studio = page.locator('#beat-inspection');
      await studio.getByRole('button', { name: 'Open beat inspection' }).click();
      const canvas = studio.getByRole('img');
      await expect(canvas).toHaveAttribute('data-ready', 'true');
      await studio.getByLabel('Quality', { exact: true }).selectOption(quality);
      await expect(canvas).toHaveAttribute('data-dpr', quality === 'high' && dpr === 2 ? '1.6' : '1');
      const capture = async (name: string) => {
        const shot = await canvas.screenshot({ path: info.outputPath(`${quality}-dpr${dpr}-${name}.png`) });
        return { shot, light: await luminance(page, shot) };
      };
      const dynamic = studio.getByLabel('Dynamic', { exact: true });
      await expect(dynamic).toHaveValue('off');
      await dynamic.selectOption('on');
      const beat = studio.getByLabel('Beat', { exact: true });
      const station = await canvas.getAttribute('data-station');
      const resources = await canvas.getAttribute('data-resources');
      await studio.getByRole('button', { name: 'Kick Peak' }).click();
      const peak = await capture('drop-peak');
      const decay = [];
      for (const ms of [50, 140, 250]) {
        await seek(beat, 222 + ms * 128 / 60000);
        decay.push((await capture(`drop-${ms}ms`)).light.strip.y);
      }
      await studio.getByRole('button', { name: 'Beat Valley' }).click();
      const valley = await capture('drop-valley');
      const falling = [peak.light.strip.y, ...decay, valley.light.strip.y];
      for (let i = 1; i < falling.length; i++) {
        expect(falling[i]).toBeLessThan(falling[i - 1]);
      }
      expect(peak.light.strip.y / valley.light.strip.y).toBeGreaterThan(2);
      expect(peak.light.wall.y / valley.light.wall.y).toBeGreaterThan(1.04);
      expect(peak.light.frame.clipped).toBeLessThan(.002);

      await studio.getByRole('button', { name: 'Snare Peak' }).click();
      await expect(canvas).toHaveAttribute('data-light-beat', '223.000');
      expect((await capture('drop-snare')).light.strip.y).toBeGreaterThan(valley.light.strip.y * 2);
      await seek(beat, 222);
      await dynamic.selectOption('off');
      const off = await capture('drop-off');
      expect(peak.light.strip.y).toBeGreaterThan(off.light.strip.y);
      expect(off.light.strip.y).toBeGreaterThan(valley.light.strip.y);
      expect(Math.abs(peak.light.glass.y / off.light.glass.y - 1)).toBeLessThan(.1);
      await dynamic.selectOption('on');
      expect((await capture('drop-repeat')).shot.equals(peak.shot)).toBe(true);
      await expect(canvas).toHaveAttribute('data-station', station!);
      await expect(canvas).toHaveAttribute('data-resources', resources!);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(studio.locator('output')).toContainText('active · baseline lighting');
      await dynamic.selectOption('off');
      const reducedOff = await capture('reduced-off');
      await dynamic.selectOption('on');
      expect((await capture('reduced-on')).shot.equals(reducedOff.shot)).toBe(true);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const section = studio.getByLabel('Section', { exact: true });
      for (const chapter of ['A', 'BREAK', 'FINALE']) {
        const previous = await canvas.getAttribute('data-station');
        await section.selectOption({ label: chapter });
        await expect(canvas).toHaveAttribute('data-station', previous!);
        await studio.getByRole('button', { name: 'Go to beat’s station' }).click();
        const on = await capture(chapter + '-on');
        await dynamic.selectOption('off');
        const off = await capture(chapter + '-off');
        expect(on.shot.equals(off.shot)).toBe(false);
        await dynamic.selectOption('on');
        if (chapter === 'BREAK') {
          await studio.getByRole('button', { name: 'Beat Valley' }).click();
          const breakValley = await capture('break-valley');
          expect(on.light.frame.y / breakValley.light.frame.y).toBeLessThan(1.3);
          expect(on.light.frame.y / breakValley.light.frame.y)
            .toBeLessThan(peak.light.frame.y / valley.light.frame.y);
        }
      }
      await studio.getByLabel('Volume', { exact: true }).selectOption('descent');
      const descent = await capture('descent-on');
      await dynamic.selectOption('off');
      expect((await capture('descent-off')).shot.equals(descent.shot)).toBe(false);
      await studio.getByRole('button', { name: 'Play continuously' }).click();
      await expect(canvas).not.toHaveAttribute('data-light-beat', '46.000');
      await studio.getByRole('button', { name: 'Pause', exact: true }).click();
      await expect(page.locator('#beat-inspection canvas')).toHaveCount(1);
      console.log('LIGHT ROI', JSON.stringify({ quality, dpr, peak: peak.light, valley: valley.light, off: off.light, decay }));
      expect(await page.evaluate(() => localStorage.getItem('sofaraway.dynamicLights'))).toBeNull();
    } finally {
      await context.close();
    }
  }
});

test('DAYBREAK lighting peaks at an authored onset with the same rendered station and resources', async ({ page }) => {
  await page.goto('/debug/#beat-inspection');
  const studio = page.locator('#beat-inspection');
  await studio.getByRole('button', { name: 'Open beat inspection' }).click();
  const canvas = studio.getByRole('img');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await studio.getByLabel('Volume', { exact: true }).selectOption('drift');
  await studio.getByLabel('Section', { exact: true }).selectOption({ label: 'SUNBURST' });
  await studio.getByLabel('Quality', { exact: true }).selectOption('low');
  await studio.getByRole('button', { name: 'Go to beat’s station' }).click();
  await studio.getByLabel('Beat', { exact: true }).fill('168');
  await studio.getByRole('button', { name: 'Kick Peak' }).click();
  await expect(studio.locator('output')).toContainText('At kick · 84.0160 s');
  const station = await canvas.getAttribute('data-station');
  const resources = await canvas.getAttribute('data-resources');
  const off = await canvas.screenshot();
  await studio.getByLabel('Dynamic', { exact: true }).selectOption('on');
  await expect(studio.locator('output')).toContainText('Fixture 1.980×');
  const peak = await canvas.screenshot();
  expect(peak.equals(off)).toBe(false);
  await studio.getByRole('button', { name: 'Beat Valley' }).click();
  const valley = await canvas.screenshot();
  expect(valley.equals(peak)).toBe(false);
  expect((await luminance(page, peak)).frame.y).toBeGreaterThan((await luminance(page, valley)).frame.y);
  await expect(canvas).toHaveAttribute('data-station', station!);
  await expect(canvas).toHaveAttribute('data-resources', resources!);
  await studio.getByRole('button', { name: 'Fill Peak' }).click();
  await expect(studio.locator('output')).toContainText('At fill');
});
