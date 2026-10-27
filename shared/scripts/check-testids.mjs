#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, tableRows, repoRoot, parseArgs } from './lib/fsutil.mjs';
import { PLATFORMS } from './check-tc-coverage.mjs';

const SOURCE_EXT = /\.(kt|swift|dart|ts|tsx|js|jsx|html|vue|svelte)$/;
const SKIP_DIRS = ['node_modules', 'build', 'Pods', '.git', '.gradle', '.dart_tool', 'DerivedData', 'dist', '.next', '.expo', 'test', 'tests', '__tests__'];
const WILDCARD = '[A-Za-z0-9_-]+';
const ID_SHAPE = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9{}\-.]*$/;
// attribute / call name followed by a string literal (interpolations allowed inside)
// Flutter `Key('...')`/`ValueKey('...')` only as constructor calls, so fields like `copyKey:` are not mistaken for testIDs.
const LITERAL_RE = /(?:\b(?:testTag|accessibilityIdentifier|testID|data-testid|dataTestId|identifier|getByTestId|queryByTestId|findByTestId|onNodeWithTag|byKey|byValueKey)\s*[(=:]|\b(?:Key|ValueKey)\s*\()\s*\{?\s*(["'`])((?:(?!\1).)*)\1/g;
const INTERPOLATION_RE = /\$\{[^}]*\}|\\\([^)]*\)|\$[A-Za-z_][A-Za-z0-9_]*|\{[^}]*\}/g;

const escapeRe = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

/** Reads the testID column of the per-screen tables (section 3 onward) of testids.md. */
export function parseTestIds(markdown) {
  const section = markdown.split(/^## 3\./m)[1] ?? markdown;
  const ids = [];
  for (const cells of tableRows(section)) {
    const m = (cells[2] ?? '').match(/^`([^`]+)`$/);
    if (!m || !ID_SHAPE.test(m[1])) continue;
    const regex = new RegExp(`^${escapeRe(m[1]).replace(/\{[^}]*\}/g, WILDCARD)}$`);
    ids.push({ id: m[1], regex });
  }
  return ids;
}

/** Finds testID-like string literals in source text. Interpolations are normalised to `{}`. */
export function extractLiterals(source) {
  const out = [];
  source.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(LITERAL_RE)) {
      const literal = m[2].replace(INTERPOLATION_RE, '{}');
      if (ID_SHAPE.test(literal)) out.push({ literal, line: i + 1 });
    }
  });
  return out;
}

const isKnown = (literal, ids) => {
  const probe = literal.replace(/\{\}/g, 'x');
  return ids.some((i) => i.id === literal || i.regex.test(probe));
};

/** files: { relPath: sourceText } -> literals that are not in the table. */
export function findUnknown(files, ids) {
  const unknown = [];
  for (const [file, source] of Object.entries(files)) {
    for (const { literal, line } of extractLiterals(source)) {
      if (!isKnown(literal, ids)) unknown.push({ file, literal, line });
    }
  }
  return unknown;
}

function loadPlatformSources(root, platform) {
  const dir = path.join(root, platform);
  const files = {};
  for (const rel of walk(dir, { skipDirs: SKIP_DIRS }).filter((r) => SOURCE_EXT.test(r))) {
    files[`${platform}/${rel}`] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return files;
}

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const platform = positional[0];
  if (!PLATFORMS[platform]) { console.error('usage: check-testids.mjs <ios|android|flutter|react-native|web> [--root <dir>] [--json]'); process.exit(2); }
  const root = path.resolve(typeof flags.root === 'string' ? flags.root : repoRoot);
  const ids = parseTestIds(fs.readFileSync(path.join(root, 'docs/testing/testids.md'), 'utf8'));
  const unknown = findUnknown(loadPlatformSources(root, platform), ids);
  if (flags.json) console.log(JSON.stringify({ platform, known: ids.length, unknown }, null, 2));
  else {
    unknown.forEach((u) => console.log(`UNKNOWN ${u.literal}  ${u.file}:${u.line}`));
    console.log(`${unknown.length ? 'FAIL' : 'OK'}: ${unknown.length} unknown testID(s) (${ids.length} ids in docs/testing/testids.md)`);
  }
  process.exit(unknown.length ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
