import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, '..'); // points to extension root

    // Chrome extensions traditionally require headed mode.
    // The --headless=new flag is experimental and may work in CI environments.
    // Set PWHEADLESS=1 to try headless mode (not guaranteed to work with extensions).
    const useHeadless = process.env.PWHEADLESS === '1';

    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extensions require headed mode; this is overridden by args
      args: [
        // Experimental: Use new headless mode in CI (may not work with all extension features)
        useHeadless ? '--headless=new' : '',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        // Disable GPU for CI environments
        ...(process.env.CI ? ['--disable-gpu', '--no-sandbox'] : []),
      ].filter(Boolean),
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // For Manifest V3 (service workers)
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
