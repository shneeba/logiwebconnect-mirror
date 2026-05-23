#!/usr/bin/env node
// Decode capture/_dump.json (array of {url, local, status, data (base64)}) and write each
// successful entry to mirror/<local>. Prints a summary and writes capture/url-map.json.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DUMP = path.join(__dirname, '_dump.json');
const MIRROR = path.join(ROOT, 'mirror');
const MAP_OUT = path.join(__dirname, 'url-map.json');

const entries = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

const urlMap = {};
let ok = 0, skipped = 0, failed = 0;

for (const e of entries) {
  if (!e.data) {
    if (e.skipped || e.status) { skipped++; continue; }
    failed++; continue;
  }
  const local = e.local.startsWith('/') ? e.local : '/' + e.local;
  const outPath = path.join(MIRROR, local);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(e.data, 'base64'));
  urlMap[e.url] = local;
  ok++;
}

fs.writeFileSync(MAP_OUT, JSON.stringify(urlMap, null, 2));
console.log(`wrote ${ok} files, skipped ${skipped}, failed ${failed}`);
console.log(`url map: ${MAP_OUT}`);
