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
  await expect(page.getByRole('status')).toHaveText('Game viewport ready');
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});
