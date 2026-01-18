/**
 * Screenshot generator for Chrome Web Store submission
 * Captures extension screenshots at 1280x800 resolution
 *
 * Usage: node scripts/take-screenshots.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXTENSION_PATH = path.resolve(__dirname, '..');
const SCREENSHOTS_DIR = path.join(EXTENSION_PATH, 'screenshots');
const VIEWPORT = { width: 1280, height: 800 };

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshots() {
  console.log('🚀 Launching Chrome with extension...');
  console.log(`📁 Extension path: ${EXTENSION_PATH}`);

  // Launch Chrome with the extension loaded
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
    viewport: VIEWPORT,
  });

  // Get the extension ID from the service worker
  let extensionId;
  let retries = 0;

  while (!extensionId && retries < 10) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      extensionId = workers[0].url().split('/')[2];
    } else {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
  }

  if (!extensionId) {
    // Try waiting for service worker event
    const sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
    extensionId = sw.url().split('/')[2];
  }

  console.log(`📦 Extension ID: ${extensionId}`);

  const page = await context.newPage();

  try {
    // ============================================
    // Navigate to quiz site
    // ============================================
    console.log('\n📸 Navigating to quiz site...');

    await page.goto('https://lifeintheuktestweb.co.uk/test-1/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for quiz container
    await page.waitForSelector('.container_question', { timeout: 15000 });
    console.log('✅ Quiz loaded');

    // Dismiss privacy banner (Quantcast CMP) - wait for it to fully load
    try {
      console.log('🍪 Waiting for privacy banner...');
      await page.waitForSelector('#qc-cmp2-ui button[mode="primary"]', { timeout: 10000 });
      console.log('🍪 Clicking AGREE...');
      await page.click('#qc-cmp2-ui button[mode="primary"]');
      // Wait for banner to disappear
      await page.waitForSelector('#qc-cmp2-ui', { state: 'hidden', timeout: 5000 });
      console.log('✅ Privacy banner dismissed');
    } catch (e) {
      console.log('ℹ️ No privacy banner or already dismissed');
    }

    // Hide ads and clutter for cleaner screenshots
    console.log('🧹 Hiding ads and clutter...');
    await page.addStyleTag({
      content: `
        /* Hide Google Ads */
        iframe[id*="google_ads"],
        iframe[src*="googlesyndication"],
        iframe[src*="doubleclick"],
        ins.adsbygoogle,
        .adsbygoogle,
        [class*="advertisement"],
        [id*="advertisement"],
        /* Hide donation/support section in sidebar */
        .widget_text,
        .textwidget,
        /* Hide other tests list sidebar */
        .sidebar,
        aside,
        /* Hide comments section */
        .comments-area,
        #comments,
        /* Hide YouTube embeds */
        iframe[src*="youtube"],
        /* Hide all right-side content after quiz */
        .entry-content > *:not(.container_question):not(.wpProQuiz_content):not([class*="quiz"]) {
          display: none !important;
        }
        /* Expand quiz to full width */
        .wpProQuiz_content, .container_question {
          max-width: 100% !important;
        }
      `
    });
    await page.waitForTimeout(300);

    // ============================================
    // Screenshot 1: Answer a question and show notification
    // ============================================
    console.log('\n📸 Capturing quiz with tracking notification...');

    // Click on "Hunter-gatherers" (the correct answer)
    await page.click('label:has-text("Hunter-gatherers")');
    await page.waitForTimeout(300);

    // Click Check button
    await page.click('button:has-text("Check")');

    // Wait for notification to appear
    await page.waitForTimeout(1000);

    // Scroll to top to ensure progress bar and notification are visible
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '1-quiz-tracking.png'),
    });
    console.log('✅ Saved: 1-quiz-tracking.png');

    // ============================================
    // Answer more questions to build stats
    // ============================================
    console.log('\n📸 Answering more questions...');

    for (let i = 0; i < 4; i++) {
      // Click Next
      const nextBtn = await page.$('button:has-text("Next")');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForTimeout(600);
      }

      // Select first answer option
      const labels = await page.$$('.container_question.active label');
      if (labels.length > 0) {
        await labels[0].click();
        await page.waitForTimeout(200);
      }

      // Click Check
      const checkBtn = await page.$('button:has-text("Check")');
      if (checkBtn) {
        await checkBtn.click();
        await page.waitForTimeout(800);
      }
    }

    // ============================================
    // Screenshot 2: Side panel with stats (Chrome Web Store min: 640x400)
    // ============================================
    console.log('\n📸 Capturing side panel...');

    const sidePanelPage = await context.newPage();
    await sidePanelPage.setViewportSize({ width: 640, height: 800 });
    await sidePanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await sidePanelPage.waitForTimeout(1500);
    await sidePanelPage.waitForSelector('#total-count');

    await sidePanelPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '2-sidepanel-stats.png'),
    });
    console.log('✅ Saved: 2-sidepanel-stats.png');

    // ============================================
    // Screenshot 3: Timeline view
    // ============================================
    console.log('\n📸 Capturing timeline view...');

    await sidePanelPage.click('[data-tab="questions"]');
    await sidePanelPage.waitForTimeout(500);

    await sidePanelPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '3-timeline-view.png'),
    });
    console.log('✅ Saved: 3-timeline-view.png');

    // ============================================
    // Done
    // ============================================
    console.log('\n✨ All screenshots captured!');
    console.log(`📁 Screenshots saved to: ${SCREENSHOTS_DIR}`);

    const files = fs.readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
    console.log('\nGenerated files:');
    files.forEach(f => console.log(`  - ${f}`));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await context.close();
  }
}

takeScreenshots().catch(console.error);
