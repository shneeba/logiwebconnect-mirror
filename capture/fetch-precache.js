#!/usr/bin/env node
// Build (or top up) ../mirror/ by downloading logiwebconnect.com's *declared* asset set.
// No browser, no UI clicks, works on any OS, which is the whole point: the live site
// refuses to run on Linux, so you can't click through its pairing flow there anyway. The
// app tells you exactly what it needs, so we just take it at its word.
//
// What it pulls, deterministically:
//   1. service-worker.js  -> its PRECACHE_URLS manifest: index.html, main.js/css, addScript,
//      manifest, favicons, logos, every per-device icon + step image (default + pressed),
//      the firmware .bin, and sources/deviceCompatibility.json + the signing key.
//   2. main.css           -> the @font-face .otf fonts (these are NOT in the precache list).
//   3. the two cross-origin device-compatibility endpoints the app fetches at runtime.
//
// Usage:  node fetch-precache.js   then   node rewrite.js   &&   ../serve.sh
//
// This is the reliable way to clone the site. `capture.js` (Playwright) is optional and only
// useful on a *supported* OS to surface anything dynamic beyond the manifest.

const fs = require('fs');
const path = require('path');

const SITE = 'https://logiwebconnect.com/';
const ROOT = path.resolve(__dirname, '..');
const MIRROR = path.join(ROOT, 'mirror');
const MAP_PATH = path.join(__dirname, 'url-map.json');

// Cross-origin runtime fetches (not same-origin, so absent from PRECACHE_URLS). Stored under
// _ext/<host>/<path> to match how rewrite.js rewrites their absolute URLs to local paths.
const EXTERNAL = [
  'https://device-compatibility.np.logitech.io/DeviceCompatibility.json',
  'https://device-compatibility.np.logitech.io/DeviceCompatibility.json.sigx',
];

const localPathFor = (urlStr) => {
  const u = new URL(urlStr);
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return u.hostname === 'logiwebconnect.com' ? p : `/_ext/${u.hostname}${p}`;
};

async function save(urlStr, urlMap) {
  const local = localPathFor(urlStr);
  let res;
  try { res = await fetch(urlStr); }
  catch (e) { console.warn(`  ERR  ${urlStr}  ${e.message}`); return false; }
  if (res.status !== 200) { console.warn(`  MISS ${res.status}  ${urlStr}`); return false; }
  const out = path.join(MIRROR, local);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  urlMap[urlStr] = local;
  return true;
}

(async () => {
  fs.mkdirSync(MIRROR, { recursive: true });
  const urlMap = {};

  // 1. service-worker.js (absent from its own list) + everything it precaches.
  const swUrl = SITE + 'service-worker.js';
  const swText = await (await fetch(swUrl)).text();
  const m = swText.match(/PRECACHE_URLS\s*=\s*(\[[^\]]*\])/);
  if (!m) { console.error('PRECACHE_URLS not found in service-worker.js, site changed?'); process.exit(1); }
  fs.writeFileSync(path.join(MIRROR, 'service-worker.js'), swText);
  urlMap[swUrl] = '/service-worker.js';
  const precache = JSON.parse(m[1]).map((u) => SITE + u.replace(/^\.\//, ''));

  // 2. @font-face fonts referenced from main.css (not in the precache list).
  let fonts = [];
  try {
    const css = await (await fetch(SITE + 'main.css')).text();
    fonts = [...new Set([...css.matchAll(/url\(\/?([A-Za-z0-9._/-]+\.(?:otf|ttf|woff2?))\)/g)]
      .map((x) => SITE + x[1].replace(/^\//, '')))];
  } catch (e) { console.warn('  (could not read main.css for fonts:', e.message + ')'); }

  // 3. fetch the lot.
  const targets = [...new Set([...precache, ...fonts, ...EXTERNAL])];
  let ok = 1; // the SW we already saved
  for (const u of targets) if (await save(u, urlMap)) ok++;

  fs.writeFileSync(MAP_PATH, JSON.stringify(urlMap, null, 2) + '\n');
  const rel = path.relative(process.cwd(), MIRROR) || MIRROR;
  console.log(`\nfetched ${ok} files into ${rel}/  (precache ${precache.length}, fonts ${fonts.length}, external ${EXTERNAL.length})`);
  console.log('next:  node rewrite.js   &&   ../serve.sh');
})().catch((e) => { console.error(e); process.exit(1); });
