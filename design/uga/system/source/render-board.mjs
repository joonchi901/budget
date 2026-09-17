import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../../..');
const out = resolve(root, 'design/uga/system');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(pathToFileURL(resolve(out, 'index.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
const images = await page.locator('img').evaluateAll(imgs => imgs.map(img => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })));
for (const id of ['brand-board', 'ui-board']) {
  await page.locator(`#${id}`).screenshot({ path: resolve(out, `${id}.png`), animations: 'disabled' });
}
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: resolve(out, 'board-mobile.png'), fullPage: true });
const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const report = { imageCount: images.length, brokenImages: images.filter(img => !img.loaded), pageErrors: errors, mobileFits };
await writeFile(resolve(out, 'board-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
await browser.close();
if (errors.length || !mobileFits || images.some(img => !img.loaded)) process.exitCode = 1;
