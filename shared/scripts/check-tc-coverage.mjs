#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, tableRows, repoRoot, parseArgs } from './lib/fsutil.mjs';

export const PLATFORMS = { ios: 'iOS', android: 'Android', flutter: 'Flutter', 'react-native': 'RN', web: 'Web' };
const MOBILE = ['ios', 'android', 'flutter', 'react-native'];
const SOURCE_EXT = /\.(kt|swift|dart|ts|tsx|js|jsx)$/;
const SKIP_DIRS = ['node_modules', 'build', 'Pods', '.git', '.gradle', '.dart_tool', 'DerivedData', 'dist', '.next', '.expo'];
const TC_RE = /TC-[A-Z]+-\d{3}/g;

export function parseCatalog(catalogDir) {
  const tcs = [];
  for (const file of fs.readdirSync(catalogDir).filter((f) => f.endsWith('.md')).sort()) {
    for (const cells of tableRows(fs.readFileSync(path.join(catalogDir, file), 'utf8'))) {
      if (!/^TC-[A-Z]+-\d{3}$/.test(cells[0] ?? '')) continue;
      tcs.push({ id: cells[0], area: cells[0].split('-')[1], agent: (cells[3] ?? '').split('+').includes('A'), file });
    }
  }
  return tcs;
}

// Lines that are only comments (e.g. a "deferred TCs" list) must not count as coverage.
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#)/;

function codeLines(text) {
  return text.split('\n').filter((line) => !COMMENT_LINE.test(line));
}

export function scanPlatform(root, platform) {
  if (!PLATFORMS[platform]) throw new Error(`unknown platform "${platform}" (expected ${Object.keys(PLATFORMS).join('|')})`);
  const found = new Set();
  const dir = path.join(root, platform);
  for (const rel of walk(dir, { skipDirs: SKIP_DIRS }).filter((r) => SOURCE_EXT.test(r))) {
    for (const line of codeLines(fs.readFileSync(path.join(dir, rel), 'utf8'))) {
      for (const m of line.matchAll(TC_RE)) found.add(m[0]);
    }
  }
  if (MOBILE.includes(platform)) {
    const maestro = path.join(root, 'shared/maestro');
    for (const rel of walk(maestro).filter((r) => r.endsWith('.yaml'))) {
      for (const m of path.posix.basename(rel).matchAll(TC_RE)) found.add(m[0]);
    }
  }
  return found;
}

export function computeCoverage(tcs, covered) {
  const areas = {};
  for (const tc of tcs) {
    const a = (areas[tc.area] ??= { covered: 0, total: 0, missing: [] });
    a.total++;
    if (covered.has(tc.id)) a.covered++;
    else a.missing.push(tc.id);
  }
  return { areas, covered: Object.values(areas).reduce((n, a) => n + a.covered, 0), total: tcs.length };
}

/** TC IDs found in platform sources that the catalog does not define (typos, stale IDs). */
export function unknownIds(tcs, covered) {
  const known = new Set(tcs.map((t) => t.id));
  return [...covered].filter((id) => !known.has(id)).sort();
}

export function updateMatrix(markdown, platform, coverage) {
  const lines = markdown.split('\n');
  const header = lines.findIndex((l) => l.startsWith('| 영역'));
  if (header < 0) throw new Error('parity-matrix.md has no header row');
  const col = lines[header].split('|').map((c) => c.trim()).indexOf(PLATFORMS[platform]);
  if (col < 0) throw new Error(`column ${PLATFORMS[platform]} not found`);
  return lines.map((line, i) => {
    if (i <= header + 1 || !line.startsWith('|')) return line;
    const cells = line.split('|');
    const area = coverage.areas[cells[1].trim()];
    if (!area) return line;
    cells[col] = ` ${area.covered}/${area.total} `;
    return cells.join('|');
  }).join('\n');
}

function report(platform, coverage, tcs) {
  const out = [`TC coverage for ${platform}: ${coverage.covered}/${coverage.total}`];
  const agentIds = new Set(tcs.filter((t) => t.agent).map((t) => t.id));
  for (const [area, a] of Object.entries(coverage.areas)) {
    out.push(`  ${area.padEnd(5)} ${a.covered}/${a.total}`);
    if (a.missing.length) out.push(`        missing: ${a.missing.map((id) => (agentIds.has(id) ? `${id}(A)` : id)).join(' ')}`);
  }
  return out.join('\n');
}

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const platform = positional[0];
  if (!PLATFORMS[platform]) { console.error('usage: check-tc-coverage.mjs <ios|android|flutter|react-native|web> [--root <dir>] [--json] [--update-matrix]'); process.exit(2); }
  const root = path.resolve(typeof flags.root === 'string' ? flags.root : repoRoot);
  const tcs = parseCatalog(path.join(root, 'docs/testing/catalog'));
  const found = scanPlatform(root, platform);
  const coverage = computeCoverage(tcs, found);
  const unknown = unknownIds(tcs, found);
  if (unknown.length) console.error(`WARNING: ${unknown.length} TC ID(s) in ${platform} sources are not in the catalog: ${unknown.join(' ')}`);
  console.log(flags.json ? JSON.stringify({ platform, ...coverage }, null, 2) : report(platform, coverage, tcs));
  if (flags['update-matrix']) {
    const file = path.join(root, 'docs/testing/parity-matrix.md');
    fs.writeFileSync(file, updateMatrix(fs.readFileSync(file, 'utf8'), platform, coverage));
    if (!flags.json) console.log(`updated ${PLATFORMS[platform]} column in ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
