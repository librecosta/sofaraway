import { expect, test } from '@playwright/test';

test('final STARWAKE exposes one production soundtrack and seven actual stems', async ({page}) => {
  await page.goto('/debug/audio/?vol=orbit&arrangement=m1');
  await expect(page.getByRole('heading',{name:'ORBIT — STARWAKE'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Arrangement',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Play Bass',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Play Pluck',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Play Lead',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Play Pad',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'AURORA',exact:true}).click();
  await page.getByRole('button',{name:'Play Lead',exact:true}).click();
  await expect(page.getByText('Playing · Lead',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('button',{name:'Reset mix',exact:true}).click();
});
