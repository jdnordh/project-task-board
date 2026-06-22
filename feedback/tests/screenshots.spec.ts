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

test('Project detail page screenshot', async ({ page }) => {
  // Navigate via the Projects page — click the first project card to reach the detail page.
  await page.goto('/projects');
  // Wait for project cards to load (first card has a color stripe div)
  await page.waitForSelector('.grove-card', { timeout: 5000 }).catch(() => {
    // If no project cards exist, skip gracefully
  });
  const firstCard = page.locator('.grove-card').first();
  const count = await firstCard.count();
  if (count > 0) {
    await firstCard.click();
    await page.waitForURL(/\/projects\/\d+/);
    await page.screenshot({ path: 'feedback/screenshots/project-detail.png', fullPage: true });
  } else {
    // No projects — screenshot the projects page to show the empty state
    await page.screenshot({ path: 'feedback/screenshots/project-detail.png', fullPage: true });
  }
});
