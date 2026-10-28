import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './feedback/tests',
  use: {
    baseURL: 'http://localhost:3005',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
