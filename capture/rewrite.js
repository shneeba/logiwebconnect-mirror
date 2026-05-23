#!/usr/bin/env node
// Rewrite mirror/ files so the site works on a local static server.
//
// Three kinds of edits:
//   1. Absolute cross-origin URLs → local /_ext/<host>/<path>  (from url-map.json).
//   2. The telemetry endpoint (datapipeline.logitech.io) → /_noop/ so POSTs fail locally
//      instead of trying to reach Logitech. The app already tolerates ingest failures.
//   3. The OS-allowlist check → always-true, so the tool runs on Linux too (see bottom).
//
// Only text-like files are touched (.html/.js/.css/.json). Binaries are left alone.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIRROR = path.join(ROOT, 'mirror');
const MAP_PATH = path.join(__dirname, 'url-map.json');
const MAP = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) : {};

const TEXT_EXTS = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json', '.map', '.svg']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Build the URL→local-path substitution list. Only cross-origin entries matter; same-origin
// paths are already relative and will resolve correctly from the server root.
const subs = [];
for (const [url, local] of Object.entries(MAP)) {
  if (/^https?:\/\//.test(url)) subs.push([url, local]);
}

// Telemetry stub: map any reference to the ingest host to a local path that returns 404.
// The SPA wraps its ingest call in try/catch so a 404 is harmless.
subs.push(['https://datapipeline.logitech.io', '/_noop/datapipeline']);

// Longest-first so we don't partially-match a longer URL with a shorter prefix.
subs.sort((a, b) => b[0].length - a[0].length);

let touched = 0, edits = 0;
for (const file of walk(MIRROR)) {
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXTS.has(ext)) continue;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  for (const [from, to] of subs) {
    if (text.includes(from)) {
      const n = text.split(from).length - 1;
      edits += n;
      text = text.split(from).join(to);
    }
  }
  if (text !== before) {
    fs.writeFileSync(file, text);
    touched++;
  }
}

console.log(`rewrote ${edits} occurrence(s) across ${touched} file(s)`);

// 3. Linux support. The bundle gates support on an OS allowlist (Windows / MacOS /
//    ChromeOS / Android) that omits Linux, so Chrome/Chromium on Linux, which fully
//    support WebHID, still show "not supported on this device". Neutralise just that OS
//    check inside the support gate; the real capability check is left intact:
//        "hid" in navigator && "forget" in HIDDevice.prototype
//    so Firefox/Safari (no WebHID) still correctly report unsupported. Name-agnostic regex
//    (backref ties matrix var + os key together) so it survives re-minification.
const MAIN_JS = path.join(MIRROR, 'main.js');
const OS_GATE = /!!(\w+)\[(\w+)\]&&\1\[\2\]\.indexOf\((\w+)\)>-1/g;
let mainSrc = fs.readFileSync(MAIN_JS, 'utf8');
const gateHits = (mainSrc.match(OS_GATE) || []).length;
if (gateHits === 1) {
  fs.writeFileSync(MAIN_JS, mainSrc.replace(OS_GATE, '!0'));
  console.log('patched main.js: disabled OS allowlist for Linux support (1 occurrence)');
} else if (gateHits === 0) {
  console.warn('WARN: OS-allowlist gate not found in main.js, already patched, or the bundle changed; Linux may show "not supported".');
} else {
  console.warn(`WARN: OS-allowlist gate matched ${gateHits}x (expected 1), Linux patch skipped to avoid a wrong edit; inspect main.js.`);
}
