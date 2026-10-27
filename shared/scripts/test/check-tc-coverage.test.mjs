import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCatalog, scanPlatform, computeCoverage, updateMatrix, unknownIds } from '../check-tc-coverage.mjs';

const CATALOG = `| ID | 검증 내용 | 근거 | 구분 | fixture | 기존 |
| --- | --- | --- | --- | --- | --- |
| TC-HOME-001 | a | b | U+W | - | - |
| TC-HOME-002 | a | b | A | - | - |
| TC-NET-001 | a | b | C | - | - |
`;

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-'));
  const w = (rel, c = '') => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), c); };
  w('docs/testing/catalog/x.md', CATALOG);
  w('web/src/a.test.ts', "it('TC-HOME-001 works', () => {})");
  w('web/node_modules/pkg/t.js', 'TC-NET-001');
  w('ios/T.swift', '@Test("TC-NET-001 ok")');
  w('shared/maestro/home/TC-HOME-002-x.yaml', 'appId: x');
  w('docs/testing/parity-matrix.md', '| 영역 | 카탈로그 | TC | A 포함 | AG | iOS | Android | Flutter | RN | Web |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| HOME | [x](x.md) | 2 | 1 | 1 | 0/2 | 0/2 | 0/2 | 0/2 | 0/2 |\n| NET | [x](x.md) | 1 | 0 | 0 | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 |\n');
  return root;
}

test('parseCatalog collects ids, area and A flag', () => {
  const tcs = parseCatalog(path.join(repo(), 'docs/testing/catalog'));
  assert.deepEqual(tcs.map((t) => [t.id, t.area, t.agent]), [['TC-HOME-001', 'HOME', false], ['TC-HOME-002', 'HOME', true], ['TC-NET-001', 'NET', false]]);
});

test('scanPlatform finds ids in sources, skips node_modules, uses maestro names for mobile only', () => {
  const root = repo();
  assert.deepEqual([...scanPlatform(root, 'web')], ['TC-HOME-001']);
  assert.deepEqual([...scanPlatform(root, 'ios')].sort(), ['TC-HOME-002', 'TC-NET-001']);
  assert.throws(() => scanPlatform(root, 'symbian'), /platform/i);
});

test('computeCoverage groups by area and lists missing', () => {
  const root = repo();
  const cov = computeCoverage(parseCatalog(path.join(root, 'docs/testing/catalog')), scanPlatform(root, 'ios'));
  assert.deepEqual(cov.areas.HOME, { covered: 1, total: 2, missing: ['TC-HOME-001'] });
  assert.deepEqual(cov.areas.NET, { covered: 1, total: 1, missing: [] });
});

test('updateMatrix rewrites only that platform column', () => {
  const root = repo();
  const cov = computeCoverage(parseCatalog(path.join(root, 'docs/testing/catalog')), scanPlatform(root, 'web'));
  const out = updateMatrix(fs.readFileSync(path.join(root, 'docs/testing/parity-matrix.md'), 'utf8'), 'web', cov);
  assert.match(out, /\| HOME \|.*\| 0\/2 \| 0\/2 \| 0\/2 \| 0\/2 \| 1\/2 \|/);
  assert.match(out, /\| NET \|.*\| 0\/1 \| 0\/1 \| 0\/1 \| 0\/1 \| 0\/1 \|/);
});

test('unknownIds lists TC ids found in source but absent from the catalog', () => {
  const tcs = parseCatalog(path.join(repo(), 'docs/testing/catalog'));
  assert.deepEqual(unknownIds(tcs, new Set(['TC-HOME-001', 'TC-HOME-999', 'TC-ABC-001'])), ['TC-ABC-001', 'TC-HOME-999']);
});

test('scanPlatform ignores TC ids that appear only in comment lines', async () => {
  const fsm = await import('node:fs');
  const os = await import('node:os');
  const root = fsm.mkdtempSync(path.join(os.tmpdir(), 'tc-comments-'));
  const src = path.join(root, 'android/src/test');
  fsm.mkdirSync(src, { recursive: true });
  fsm.writeFileSync(path.join(src, 'A.kt'), [
    '/**',
    ' * Deferred: TC-NET-001, TC-NET-002',
    ' */',
    '// TC-NET-003 later',
    'class A {',
    '  @Test fun `TC-TIME-001 kst today`() {} // also TC-NET-004 in trailing comment counts as code line',
    '}',
  ].join('\n'));
  fsm.writeFileSync(path.join(src, 'b.dart'), "/// TC-NET-005 doc\ntest('TC-TIME-002 x', () {});\n# not dart but fine\n");
  const found = [...scanPlatform(root, 'android')].sort();
  assert.ok(found.includes('TC-TIME-001'));
  for (const id of ['TC-NET-001', 'TC-NET-002', 'TC-NET-003', 'TC-NET-005']) assert.ok(!found.includes(id), id);
});
