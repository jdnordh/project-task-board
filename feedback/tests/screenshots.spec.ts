// Run 'npm run dev' before running feedback tests

import { test } from '@playwright/test';

test('Board page screenshot', async ({ page }) => {
  await page.goto('/');
  await page.screenshot({ path: 'feedback/screenshots/board.png', fullPage: true });
});

test('Projects page screenshot', async ({ page }) => {
  await page.goto('/projects');
  await page.screenshot({ path: 'feedback/screenshots/projects.png', fullPage: true });
});
