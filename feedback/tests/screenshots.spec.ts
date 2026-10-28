// Run 'npm run dev' before running feedback tests.
// Screenshot-only: no assertions, and no writes to the board.

import { test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 } });

for (const page of ['board', 'features', 'settings']) {
  test(`${page} page screenshot`, async ({ page: p }) => {
    await p.goto(`/#/${page}`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `feedback/screenshots/${page}.png`, fullPage: true });
  });
}

test('task drawer screenshot', async ({ page }) => {
  await page.goto('/#/board');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'New task' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'feedback/screenshots/drawer.png' });
});
