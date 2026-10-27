#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, sharedRoot } from './lib/fsutil.mjs';

const defaultDir = path.join(sharedRoot, 'fixtures');

export function buildManifest(fixturesDir = defaultDir) {
  const entries = [];
  for (const dirent of fs.readdirSync(fixturesDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const routesFile = path.join(fixturesDir, dirent.name, '_routes.json');
    if (!fs.existsSync(routesFile)) continue;
    const routes = readJson(routesFile);
    if (!Array.isArray(routes)) throw new Error(`${dirent.name}/_routes.json must be an array`);
    entries.push(...routes);
  }
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.fixture)) throw new Error(`duplicate manifest entry for ${e.fixture}`);
    seen.add(e.fixture);
  }
  return entries.sort((a, b) => (a.fixture < b.fixture ? -1 : a.fixture > b.fixture ? 1 : 0));
}

const serialize = (entries) => `${JSON.stringify(entries, null, 2)}\n`;
const manifestPath = (dir) => path.join(dir, 'manifest.json');

export function writeManifest(fixturesDir = defaultDir) {
  fs.writeFileSync(manifestPath(fixturesDir), serialize(buildManifest(fixturesDir)));
}

export function checkManifest(fixturesDir = defaultDir) {
  const file = manifestPath(fixturesDir);
  return fs.existsSync(file) && fs.readFileSync(file, 'utf8') === serialize(buildManifest(fixturesDir));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const ok = checkManifest();
    console.log(ok ? 'manifest.json is up to date' : 'manifest.json is out of date: run node shared/scripts/build-manifest.mjs');
    process.exit(ok ? 0 : 1);
  }
  writeManifest();
  console.log(`wrote ${manifestPath(defaultDir)}`);
}
