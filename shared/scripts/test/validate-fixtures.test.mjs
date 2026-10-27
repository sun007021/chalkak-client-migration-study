import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateFixtures, extractCatalogFixtures } from '../validate-fixtures.mjs';
import { writeManifest } from '../build-manifest.mjs';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function setup(files, routes, catalog) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-'));
  const fixturesDir = path.join(root, 'fixtures');
  const catalogDir = path.join(root, 'catalog');
  fs.mkdirSync(catalogDir);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(fixturesDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  }
  for (const [area, entries] of Object.entries(routes)) {
    fs.mkdirSync(path.join(fixturesDir, area), { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, area, '_routes.json'), JSON.stringify(entries));
  }
  writeManifest(fixturesDir);
  if (catalog) fs.writeFileSync(path.join(catalogDir, 'x.md'), catalog);
  return { fixturesDir, catalogDir };
}
const run = (s) => validateFixtures(s);
const messages = (r) => r.errors.join('\n');

test('clean fixture set passes', () => {
  const s = setup({ 'home/a.json': { topicDate: '2026-10-27', isPosted: false, postId: null, moderationStatus: null } },
    { home: [{ fixture: 'home/a.json', method: 'GET', path: '/api/v1/posts/today', status: 200 }] });
  assert.deepEqual(run(s).errors, []);
});

test('reports invalid JSON, orphan files and missing files', () => {
  const s = setup({ 'home/bad.json': '{nope', 'home/orphan.json': {} },
    { home: [{ fixture: 'home/ghost.json', method: 'GET', path: '/api/v1/x', status: 200 }] });
  const m = messages(run(s));
  assert.match(m, /bad\.json.*parse/i);
  assert.match(m, /orphan\.json.*no manifest entry/i);
  assert.match(m, /ghost\.json.*does not exist/i);
});

test('entry validation: method, path, status', () => {
  const s = setup({ 'a/1.json': {}, 'a/2.json': {}, 'a/3.json': {} }, {
    a: [
      { fixture: 'a/1.json', method: 'FETCH', path: '/api/v1/x', status: 200 },
      { fixture: 'a/2.json', method: 'GET', path: '/x', status: 200 },
      { fixture: 'a/3.json', method: 'GET', path: '/api/v1/x' },
    ],
  });
  const m = messages(run(s));
  assert.match(m, /1\.json.*method/);
  assert.match(m, /2\.json.*path/);
  assert.match(m, /3\.json.*status/);
});

test('NONE, PUSH and request entries skip path and status checks', () => {
  const s = setup({ 'a/case.json': { _kind: 'case', rows: [] }, 'a/push.json': { _kind: 'push', data: {} }, 'a/req.json': { _kind: 'request', body: {} }, 'u/up.json': { _raw: '' } }, {
    a: [
      { fixture: 'a/case.json', method: 'NONE', path: '-' },
      { fixture: 'a/push.json', method: 'PUSH', path: 'x' },
      { fixture: 'a/req.json', method: 'POST', path: '/api/v1/posts' },
    ],
    u: [{ fixture: 'u/up.json', method: 'PUT', path: '/__upload/55555555-5555-4555-8555-555555555501', status: 200 }],
  });
  assert.deepEqual(run(s).errors, []);
});

test('error bodies need errorCode and message unless _raw/_fault', () => {
  const s = setup({ 'e/a.json': { errorCode: 'X' }, 'e/b.json': { _raw: '<html>' }, 'e/c.json': { _fault: 'timeout' }, 'e/d.json': { errorCode: 'X', message: 'm' } }, {
    e: ['a', 'b', 'c', 'd'].map((n, i) => ({ fixture: `e/${n}.json`, method: 'GET', path: '/api/v1/e', status: i === 2 ? 0 : 500 })),
  });
  const m = messages(run(s));
  assert.match(m, /a\.json.*message/);
  assert.doesNotMatch(m, /b\.json|c\.json|d\.json/);
});

test('UUID strings must be lowercase', () => {
  const s = setup({ 'u/a.json': { id: ID.toUpperCase(), url: `https://x/${ID}/a.webp` } },
    { u: [{ fixture: 'u/a.json', method: 'GET', path: '/api/v1/u', status: 200 }] });
  assert.match(messages(run(s)), /uppercase|lowercase/i);
});

test('shape check applies schema for known routes', () => {
  const s = setup({ 'h/a.json': { topicDate: '2026-10-27' } },
    { h: [{ fixture: 'h/a.json', method: 'GET', path: '/api/v1/posts/today', status: 200 }] });
  assert.match(messages(run(s)), /isPosted/);
});

test('stale manifest is reported', () => {
  const s = setup({ 'a/1.json': {} }, { a: [{ fixture: 'a/1.json', method: 'GET', path: '/api/v1/x', status: 200 }] });
  fs.writeFileSync(path.join(s.fixturesDir, 'a', '_routes.json'), '[]');
  assert.match(messages(run(s)), /manifest.*out of date/i);
});

test('catalog references: extract and report missing', () => {
  const md = '| ID | 검증 | 근거 | 구분 | fixture | 기존 |\n| --- | --- | --- | --- | --- | --- |\n| TC-A-001 | x | y | U | home/1.json, home/2.json (HOME 소유), shared/constants.json, edit/golden/*.json | z |\n';
  assert.deepEqual(extractCatalogFixtures(md), ['home/1.json', 'home/2.json']);
  const s = setup({ 'home/1.json': {} }, { home: [{ fixture: 'home/1.json', method: 'GET', path: '/api/v1/x', status: 200 }] }, md);
  assert.deepEqual(run(s).missing, ['home/2.json']);
});

test('uppercase UUID is allowed in fixtures named *uppercase*', () => {
  const s = setup({ 'push/payload__uppercase-uuid.json': { _kind: 'push', data: { id: ID.toUpperCase() } } },
    { push: [{ fixture: 'push/payload__uppercase-uuid.json', method: 'PUSH', path: '-' }] });
  assert.deepEqual(run(s).errors, []);
});

test('fault routes may omit status; any _kind is fine for NONE; shared routes are not duplicates', () => {
  const s = setup({ 'n/f.json': { _fault: 'timeout' }, 'n/s.json': { _kind: 'storage', x: 1 }, 'n/a.json': { ok: 1 }, 'n/b.json': { ok: 2 } }, {
    n: [
      { fixture: 'n/f.json', method: 'GET', path: '/api/v1/posts/today', delayMs: 20000 },
      { fixture: 'n/s.json', method: 'NONE', path: '-' },
      { fixture: 'n/a.json', method: 'GET', path: '/api/v1/same', status: 200 },
      { fixture: 'n/b.json', method: 'GET', path: '/api/v1/same', status: 200 },
    ],
  });
  assert.deepEqual(run(s).errors, []);
});

test('negative probes (…__missing-…/invalid) skip the shape check; iTunes /lookup path is allowed', () => {
  const s = setup({ 'h/posts-today__missing-fields.json': { topicDate: 'x' }, 'b/lookup.json': { results: [] } }, {
    h: [{ fixture: 'h/posts-today__missing-fields.json', method: 'GET', path: '/api/v1/posts/today', status: 200 }],
    b: [{ fixture: 'b/lookup.json', method: 'GET', path: '/lookup', status: 200 }],
  });
  assert.deepEqual(run(s).errors, []);
});

test('negative-name skip is anchored right after "__" (a "missing" later in the name still gets shape-checked)', () => {
  const route = (f) => ({ fixture: f, method: 'GET', path: '/api/v1/posts/today', status: 200 });
  const s = setup({ 'home/a__missing-x.json': { nope: 1 }, 'home/a__ok-missing-x.json': { nope: 1 } },
    { home: [route('home/a__missing-x.json'), route('home/a__ok-missing-x.json')] });
  const msg = messages(run(s));
  assert.doesNotMatch(msg, /a__missing-x\.json/);
  assert.match(msg, /a__ok-missing-x\.json: shape/);
});
