const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const OUT_DIR = path.join(__dirname, '..', 'out');

/**
 * Ensures the output directory exists.
 */
function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

/**
 * Captures a screenshot of an HTML element.
 * @param {string} htmlFile - Path to HTML file relative to project root.
 * @param {string} outputFile - Output filename (will be placed in out/).
 * @param {number} width - Viewport width.
 * @param {number} height - Viewport height.
 * @param {string} selector - CSS selector for element to capture.
 */
async function captureElement(htmlFile, outputFile, width, height, selector) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({ width, height });

  const htmlPath = path.join(__dirname, '..', htmlFile);
  await page.goto(`file://${htmlPath}`);

  const element = await page.$(selector);

  await element.screenshot({
    path: path.join(OUT_DIR, outputFile),
    type: 'png',
    omitBackground: false
  });

  console.log(`Generated: out/${outputFile} (${width}x${height}, 24-bit PNG)`);

  await browser.close();
}

/**
 * Generates a promo tile image from HTML.
 * @param {string} htmlFile - Path to HTML file relative to project root.
 * @param {string} outputFile - Output filename.
 * @param {number} width - Tile width.
 * @param {number} height - Tile height.
 */
async function generateTile(htmlFile, outputFile, width, height) {
  await captureElement(htmlFile, outputFile, width, height, '.tile');
}

/**
 * Generates a store icon image from HTML.
 * @param {string} htmlFile - Path to HTML file relative to project root.
 * @param {string} outputFile - Output filename.
 * @param {number} size - Icon size (width and height).
 */
async function generateIcon(htmlFile, outputFile, size) {
  await captureElement(htmlFile, outputFile, size, size, '.icon');
}

/**
 * Main entry point. Generates all promo assets.
 */
async function main() {
  ensureOutDir();

  // Small tile: 440x280
  await generateTile('promo-tile.html', 'promo-tile-440x280.png', 440, 280);

  // Marquee tile: 1400x560
  await generateTile('promo-tile-marquee.html', 'promo-tile-1400x560.png', 1400, 560);

  // Store icon: 128x128
  await generateIcon('store-icon.html', 'store-icon-128x128.png', 128);
}

main().catch(console.error);
