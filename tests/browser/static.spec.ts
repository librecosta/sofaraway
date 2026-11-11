import { expect, test } from '@playwright/test';

test('prerenders the page and hydrates one client canvas', async ({ request, page }) => {
  const html = await (await request.get('/?vol=orbit')).text();
  expect(html).toContain('LibreCosta');
  expect(html).toContain('og:title');
  expect(html).toContain('SOFARAWAY');
  expect(html).not.toContain('<canvas');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('[data-act=start]')).toBeEnabled();
  await expect(page.locator('canvas#gl')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('volume navigation and preferences work without replacing the document or canvas', async ({ page }) => {
  await page.goto('/?vol=elsewhere&q=low');
  const start = page.locator('[data-act=start]');
  await expect(start).toBeEnabled();
  const canvas = await page.locator('#gl').elementHandle();
  await page.getByRole('button', { name: 'next volume' }).click();
  await expect(page.locator('#vol-name')).toContainText('DRIFT');
  await expect(page).toHaveURL(/vol=drift/);
  await page.goBack();
  await expect(page.locator('#vol-name')).toContainText('ELSEWHERE');
  await page.goForward();
  await expect(page.locator('#vol-name')).toContainText('DRIFT');
  expect(await canvas!.evaluate(el => el === document.querySelector('#gl'))).toBe(true);

  await page.locator('[data-act=settings]').click();
  await page.locator('#set-volume').fill('37');
  await page.locator('#set-muted').check();
  await page.locator('[data-q=high]').click();
  await expect(page.locator('[data-q=high]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  await page.locator('[data-act=start]').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(start).toBeEnabled();
  await page.reload();
  await expect(start).toBeEnabled();
  await page.locator('[data-act=settings]').click();
  await expect(page.locator('#set-volume')).toHaveValue('37');
  await expect(page.locator('#set-muted')).toBeChecked();
});
