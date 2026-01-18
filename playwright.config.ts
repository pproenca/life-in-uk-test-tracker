import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Extension tests share browser context, limit to 1
  fullyParallel: false, // Disable for extension tests that share context
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure', // Add video for debugging failed tests
  },
  projects: [
    {
      name: 'chromium',
    },
  ],
});
