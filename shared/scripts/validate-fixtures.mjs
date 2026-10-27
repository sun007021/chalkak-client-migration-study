#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, walk, tableRows, repoRoot, sharedRoot, parseArgs } from './lib/fsutil.mjs';
import { checkManifest } from './build-manifest.mjs';
import { findSchema, validateShape } from './schemas.mjs';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'PUSH', 'NONE'];
const AREAS = ['common', 'auth', 'boot', 'onboarding', 'signature', 'settings', 'feedback', 'anl', 'time', 'home', 'banner', 'display', 'feed', 'like', 'record', 'upload', 'ai-review', 'notification', 'push'];
const EXTERNAL_PATHS = ['/lookup']; // iTunes lookup (external host)
// fixtures named `<base>__missing-*`, `__invalid-*` ... right after `__` are deliberately malformed contract probes: skip the shape check
const NEGATIVE_NAME_RE = /__(missing|invalid|malformed|broken|no-)/;
// intentionally broken fixtures whose names do not follow `__<negative>` (catalog references the names, so no renaming)
const INTENTIONAL_BROKEN = ['auth/social-login__login-success-missing-token.json'];
const RESERVED_FILES = ['_routes.json', 'manifest.json'];
const UUID_RE = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

const isFixtureFile = (rel) => rel.endsWith('.json') && !RESERVED_FILES.includes(path.posix.basename(rel));
const isNoResponse = (entry, body) => entry.method === 'NONE' || entry.method === 'PUSH' || body?._kind === 'request';

/** Fixture paths referenced in the "fixture" column of catalog tables (only paths under known area folders). */
export function extractCatalogFixtures(markdown) {
  const found = new Set();
  for (const cells of tableRows(markdown)) {
    if (!/^TC-[A-Z]+-\d{3}$/.test(cells[0] ?? '')) continue;
    for (const m of (cells[4] ?? '').matchAll(/([a-z-]+)\/([A-Za-z0-9_.-]+\.json)/g)) {
      if (AREAS.includes(m[1])) found.add(`${m[1]}/${m[2]}`);
    }
  }
  return [...found];
}

function loadFixtures(fixturesDir, errors) {
  const bodies = new Map();
  const unparsable = new Set();
  for (const rel of walk(fixturesDir).filter(isFixtureFile)) {
    try { bodies.set(rel, readJson(path.join(fixturesDir, rel))); }
    catch (err) { unparsable.add(rel); errors.push(`${rel}: cannot parse JSON (${err.message})`); }
  }
  return { bodies, unparsable };
}

function checkManifestEntries(manifest, { bodies, unparsable }, errors) {
  const counts = new Map();
  for (const e of manifest) counts.set(e.fixture, (counts.get(e.fixture) ?? 0) + 1);
  for (const rel of [...bodies.keys(), ...unparsable]) if (!counts.has(rel)) errors.push(`${rel}: fixture file has no manifest entry`);
  for (const [rel, n] of counts) {
    if (n > 1) errors.push(`${rel}: ${n} manifest entries (expected exactly one)`);
    if (!bodies.has(rel) && !unparsable.has(rel)) errors.push(`${rel}: manifest entry points to a file that does not exist`);
  }
}

function checkEntry(entry, body, errors) {
  const at = entry.fixture;
  if (!METHODS.includes(entry.method)) { errors.push(`${at}: invalid method ${JSON.stringify(entry.method)}`); return; }
  if (isNoResponse(entry, body)) return;
  const pathOk = typeof entry.path === 'string' && (entry.path.startsWith('/api/v1/') || entry.path.startsWith('/__upload/') || EXTERNAL_PATHS.includes(entry.path));
  if (!pathOk) errors.push(`${at}: path must start with /api/v1/ (got ${JSON.stringify(entry.path)})`);
  if (body?._fault !== undefined) return; // fault routes may omit status
  if (!Number.isInteger(entry.status)) { errors.push(`${at}: status is required`); return; }
  checkBody(entry, body, errors);
}

function checkBody(entry, body, errors) {
  if (!body || body._raw !== undefined || body._fault !== undefined) return;
  if (entry.status >= 400) {
    for (const key of ['errorCode', 'message']) {
      if (typeof body[key] !== 'string') errors.push(`${entry.fixture}: error body needs string ${key}`);
    }
    return;
  }
  if (NEGATIVE_NAME_RE.test(entry.fixture) || INTENTIONAL_BROKEN.includes(entry.fixture)) return;
  const schema = findSchema(entry.method, entry.path, entry.status);
  if (schema) for (const msg of validateShape(body, schema)) errors.push(`${entry.fixture}: shape(${schema.name}) ${msg}`);
}

function checkUuids(rel, body, errors) {
  if (path.posix.basename(rel).includes('uppercase')) return; // intentional negative fixtures
  const text = JSON.stringify(body);
  const bad = new Set((text.match(UUID_RE) ?? []).filter((u) => u !== u.toLowerCase()));
  for (const u of bad) errors.push(`${rel}: UUID must be lowercase canonical form (uppercase found: ${u})`);
}

function catalogMissing(catalogDir, manifest) {
  if (!catalogDir || !fs.existsSync(catalogDir)) return [];
  const have = new Set(manifest.map((e) => e.fixture));
  const wanted = new Set();
  for (const f of fs.readdirSync(catalogDir).filter((n) => n.endsWith('.md'))) {
    extractCatalogFixtures(fs.readFileSync(path.join(catalogDir, f), 'utf8')).forEach((x) => wanted.add(x));
  }
  return [...wanted].filter((x) => !have.has(x)).sort();
}

export function validateFixtures({ fixturesDir, catalogDir }) {
  const errors = [];
  const loaded = loadFixtures(fixturesDir, errors);
  const { bodies } = loaded;
  const manifestFile = path.join(fixturesDir, 'manifest.json');
  let manifest = [];
  if (fs.existsSync(manifestFile)) manifest = readJson(manifestFile);
  else errors.push('manifest.json does not exist: run build-manifest.mjs');
  checkManifestEntries(manifest, loaded, errors);
  for (const entry of manifest) if (bodies.has(entry.fixture)) checkEntry(entry, bodies.get(entry.fixture), errors);
  for (const [rel, body] of bodies) checkUuids(rel, body, errors);
  try { if (!checkManifest(fixturesDir)) errors.push('manifest.json is out of date: run node shared/scripts/build-manifest.mjs'); }
  catch (err) { errors.push(`manifest check failed: ${err.message}`); }
  return { errors, missing: catalogMissing(catalogDir, manifest) };
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const result = validateFixtures({ fixturesDir: path.join(sharedRoot, 'fixtures'), catalogDir: path.join(repoRoot, 'docs/testing/catalog') });
  result.errors.forEach((e) => console.log(`ERROR  ${e}`));
  if (result.missing.length) {
    console.log(`\n${result.missing.length} fixture(s) referenced by docs/testing/catalog but missing from the manifest:`);
    result.missing.forEach((m) => console.log(`  MISSING ${m}`));
  }
  const failed = result.errors.length > 0 || (result.missing.length > 0 && !flags['allow-missing']);
  console.log(`\n${failed ? 'FAIL' : 'OK'}: ${result.errors.length} error(s), ${result.missing.length} missing`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
