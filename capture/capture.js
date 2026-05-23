#!/usr/bin/env node
// Re-capture https://logiwebconnect.com/ into ../mirror/ by recording live traffic while you
// click through the UI with a receiver plugged in.
//
// OPTIONAL, and only works on a *supported* OS (Windows / macOS / ChromeOS). On Linux the live
// site shows "not supported on this device", so there's no flow to click through, use
// `node fetch-precache.js` instead (no browser, no clicking, any OS). Reach for this script only
// to capture anything dynamic that lives outside the service worker's precache manifest.
//
// Prereqs:  npm install  (installs playwright)  +  npx playwright install chromium
// Usage:    node capture.js
//
// What it does:
//   - Launches a visible Chromium window and opens logiwebconnect.com.
//   - Records every response body to ../mirror/ under a path derived from the URL:
//       same-origin   → mirror/<pathname>
//       cross-origin  → mirror/_ext/<host>/<pathname>
//   - Writes a HAR to session.har and a URL→local-path map to url-map.json.
//   - **Stays open** so you can click through the real pairing / firmware flow with a
//     Unifying or Bolt receiver plugged in. That's what reveals dynamic assets that
//     aren't visible on the landing page. Press Enter in the terminal to finish.
//
// After this script exits, run `node rewrite.js` to patch absolute URLs, then
// `../serve.sh` to run the mirror locally.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const MIRROR = path.join(ROOT, 'mirror');
const MAP_PATH = path.join(__dirname, 'url-map.json');
const HAR_PATH = path.join(__dirname, 'session.har');
const SITE = 'https://logiwebconnect.com/';

function localPathFor(urlStr) {
  const u = new URL(urlStr);
  const isSame = u.hostname === 'logiwebconnect.com';
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return isSame ? p : `/_ext/${u.hostname}${p}`;
}

async function saveResponse(res, urlMap) {
  const url = res.url();
  if (!/^https?:/.test(url)) return;
  if (res.status() !== 200) return;
  let body;
  try { body = await res.body(); } catch { return; }
  const local = localPathFor(url);
  const outPath = path.join(MIRROR, local);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, body);
  urlMap[url] = local;
}

async function main() {
  fs.mkdirSync(MIRROR, { recursive: true });
  const urlMap = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) : {};

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ recordHar: { path: HAR_PATH } });
  const page = await context.newPage();

  page.on('response', (res) => { saveResponse(res, urlMap).catch(() => {}); });

  console.log(`opening ${SITE} …`);
  await page.goto(SITE, { waitUntil: 'networkidle' });

  console.log('\nNow exercise the flow in the browser:');
  console.log('  • plug in your Unifying / Bolt receiver');
  console.log('  • click through Pair device / Update firmware');
  console.log('  • visit every screen you care about');
  console.log('\nWhen finished, press Enter here to save & exit.');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((res) => rl.question('', () => { rl.close(); res(); }));

  await context.close();
  await browser.close();

  fs.writeFileSync(MAP_PATH, JSON.stringify(urlMap, null, 2));
  console.log(`\nsaved ${Object.keys(urlMap).length} URLs`);
  console.log(`HAR:       ${HAR_PATH}`);
  console.log(`url map:   ${MAP_PATH}`);
  console.log(`next:      node rewrite.js  &&  ../serve.sh`);
}

main().catch((e) => { console.error(e); process.exit(1); });
