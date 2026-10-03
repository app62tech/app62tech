// Accessibility gate (PRD §18): serves the built `dist/` output and scans
// every route with axe-core. Fails the build on any serious/critical
// violation — run after `npm run build`.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const DIST = new URL('../dist/', import.meta.url).pathname;
const PORT = 4173;

const ROUTES = ['/', '/privacy/', '/terms/', '/404.html'];

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const filePath = join(DIST, path);
  try {
    await stat(filePath);
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((resolve) => server.listen(PORT, resolve));

const browser = await chromium.launch();
const context = await browser.newContext();

let seriousCount = 0;
let hadError = false;

for (const route of ROUTES) {
  const page = await context.newPage();
  try {
    // Not 'networkidle': the Turnstile widget keeps a connection open, so the
    // network never goes idle on pages with the contact form.
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

    console.log(`${route} — ${results.violations.length} violation(s), ${serious.length} serious/critical`);
    for (const v of serious) {
      console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
      for (const n of v.nodes) {
        console.log(`      ${n.target.join(' ')}`);
        console.log(`      html: ${n.html}`);
        console.log(`      ${n.failureSummary}`);
      }
    }
    seriousCount += serious.length;
  } catch (err) {
    hadError = true;
    console.error(`${route} — failed to scan: ${err}`);
  } finally {
    await page.close();
  }
}

await browser.close();
server.close();

if (seriousCount > 0 || hadError) {
  console.error(`\nFAILED — ${seriousCount} serious/critical violation(s) across ${ROUTES.length} routes.`);
  process.exit(1);
}

console.log(`\nOK — 0 serious/critical violations across ${ROUTES.length} routes.`);
