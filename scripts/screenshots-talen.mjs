/**
 * Local screenshots of the language UI. Requires Expo web on :8081
 * with EXPO_PUBLIC_SCREENSHOTS=1. Does not send messages or place calls.
 */
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try { return require('playwright'); }
  catch { return createRequire('/tmp/package.json')('playwright'); }
})();

const out = path.resolve('docs/screenshots/talen');
await mkdir(out, { recursive: true });

const shots = [
  ['taal', 'nl', '', 'taal-kiezer.png', 'language-picker'],
  ['dashboard', 'en', '', 'dashboard-en.png', 'dashboard-preview'],
  ['dashboard', 'de', '', 'dashboard-de.png', 'dashboard-preview'],
  ['dashboard', 'tr', '', 'dashboard-tr.png', 'dashboard-preview'],
  ['dashboard', 'ar', '', 'dashboard-ar.png', 'dashboard-preview'],
  ['dashboard', 'pl', '', 'dashboard-pl.png', 'dashboard-preview'],
  ['nood', 'nl', 'NL', 'nood-nl.png', 'emergency-primary'],
  ['nood', 'en', 'US', 'nood-us.png', 'emergency-primary'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const [view, lang, region, file, testId] of shots) {
  await page.setViewportSize({ width: 390, height: view === 'nood' ? 2400 : 900 });
  const regionQ = region ? `&region=${region}` : '';
  const url = `http://127.0.0.1:8081/scherm?view=${view}&lang=${lang}${regionQ}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 180000 });
  const hideOverlay = () => page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const root = el.shadowRoot;
      if (!root) continue;
      const text = root.textContent || '';
      if (text.includes('Uncaught Error') || text.includes('CONVEX FATAL')) {
        el.style.setProperty('display', 'none', 'important');
        el.remove();
      }
    }
  });
  for (let i = 0; i < 8; i++) {
    await hideOverlay();
    await page.waitForTimeout(250);
  }
  await hideOverlay();
  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
  await page.screenshot({ path: path.join(out, file), fullPage: true });
  console.log('saved', file, 'dir=', dir);
}
await browser.close();
