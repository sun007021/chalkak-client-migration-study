import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createMockServer } from '../server.mjs';

let root, srv, base;
const write = (rel, content) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
};

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mock-'));
  write('fixtures/a/ok.json', { hello: 'world' });
  write('fixtures/a/alt.json', { hello: 'alt' });
  write('fixtures/a/q1.json', { q: 1 });
  write('fixtures/a/q2.json', { q: 2 });
  write('fixtures/a/err.json', { errorCode: 'UNAUTHORIZED', message: 'no' });
  write('fixtures/a/html.json', { _raw: '<html>oops</html>', _contentType: 'text/html' });
  write('fixtures/a/empty.json', { _raw: '' });
  write('fixtures/a/timeout.json', { _fault: 'timeout' });
  write('fixtures/a/disc.json', { _fault: 'disconnect' });
  write('fixtures/a/slow.json', { slow: true });
  write('fixtures/a/hdr.json', { h: 1 });
  write('fixtures/a/case.json', { _kind: 'case' });
  write('fixtures/a/pref1.json', { pick: 'first' });
  write('fixtures/a/pref2__ok.json', { pick: 'ok' });
  write('fixtures/a/seq1.json', { n: 1 });
  write('fixtures/a/seq2.json', { n: 2 });
  write('fixtures/a/created.json', { id: 'x' });
  write('fixtures/a/cal.json', { cal: true });
  write('fixtures/a/wild.json', { wild: true });
  write('fixtures/a/presigned.json', { uploadUrl: 'http://localhost:4010/__upload/x?a=1', other: ['http://localhost:4010/y'] });
  write('fixtures/a/rawurl.json', { _raw: 'see http://localhost:4010/z', _contentType: 'text/plain' });
  write('fixtures/manifest.json', [
    { fixture: 'a/cal.json', method: 'GET', path: '/api/v1/things/calendar', status: 200, query: { year: '2026' } },
    { fixture: 'a/presigned.json', method: 'GET', path: '/api/v1/presigned', status: 200 },
    { fixture: 'a/rawurl.json', method: 'GET', path: '/api/v1/rawurl', status: 200 },
    { fixture: 'a/ok.json', method: 'GET', path: '/api/v1/hello', status: 200 },
    { fixture: 'a/alt.json', method: 'GET', path: '/api/v1/hello', status: 200, query: { v: 'alt' } },
    { fixture: 'a/err.json', method: 'GET', path: '/api/v1/hello', status: 401 },
    { fixture: 'a/q1.json', method: 'GET', path: '/api/v1/q', status: 200, query: { page: '1' } },
    { fixture: 'a/q2.json', method: 'GET', path: '/api/v1/q', status: 200, query: { page: '2' } },
    { fixture: 'a/html.json', method: 'GET', path: '/api/v1/html', status: 502 },
    { fixture: 'a/empty.json', method: 'DELETE', path: '/api/v1/thing', status: 204 },
    { fixture: 'a/timeout.json', method: 'GET', path: '/api/v1/timeout', status: 200 },
    { fixture: 'a/disc.json', method: 'GET', path: '/api/v1/disc', status: 200 },
    { fixture: 'a/slow.json', method: 'GET', path: '/api/v1/slow', status: 200, delayMs: 150 },
    { fixture: 'a/hdr.json', method: 'GET', path: '/api/v1/hdr', status: 429, headers: { 'Retry-After': '3' } },
    { fixture: 'a/case.json', method: 'NONE', path: '-' },
    { fixture: 'a/created.json', method: 'POST', path: '/api/v1/things', status: 201 },
    { fixture: 'a/seq1.json', method: 'GET', path: '/api/v1/seq', status: 200 },
    { fixture: 'a/pref1.json', method: 'GET', path: '/api/v1/pref', status: 200 },
    { fixture: 'a/pref2__ok.json', method: 'GET', path: '/api/v1/pref', status: 200 },
  ]);
  write('scenarios/default.json', { 'GET /api/v1/scn': 'a/ok.json', 'GET /api/v1/ghost': 'a/missing.json', 'GET /api/v1/hdr': 'a/hdr.json', 'GET /api/v1/html': 'a/html.json' });
  write('scenarios/other.json', {
    'GET /api/v1/scn': 'a/alt.json',
    'GET /api/v1/seq': ['a/seq1.json', 'a/seq2.json'],
    'GET /api/v1/items/*': 'a/ok.json',
    'GET /api/v1/things/*': 'a/wild.json',
    'GET /api/v1/items/*/detail': 'a/alt.json',
    'GET /api/v1/q?page=2': 'a/q1.json',
  });
  srv = createMockServer({ fixturesDir: path.join(root, 'fixtures'), scenariosDir: path.join(root, 'scenarios'), faultHoldMs: 400, logger: { warn() {}, log() {} } });
  await srv.listen(0);
  base = `http://127.0.0.1:${srv.port}`;
});
after(() => srv.close());
beforeEach(async () => {
  await fetch(`${base}/__admin/reset`, { method: 'POST' });
  await fetch(`${base}/__admin/scenario`, { method: 'POST', body: JSON.stringify({ name: 'default' }) });
});

const get = async (p, init) => { const r = await fetch(base + p, init); return { r, body: await r.json().catch(() => null) }; };

test('falls back to the first 2xx manifest entry matching method and path', async () => {
  const { r, body } = await get('/api/v1/hello');
  assert.equal(r.status, 200);
  assert.deepEqual(body, { hello: 'world' });
  assert.match(r.headers.get('content-type'), /application\/json/);
});

test('fallback honours query constraints and ignores non-2xx entries', async () => {
  assert.deepEqual((await get('/api/v1/hello?v=alt')).body, { hello: 'alt' });
  assert.deepEqual((await get('/api/v1/q?page=2')).body, { q: 2 });
  assert.equal((await get('/api/v1/q?page=9')).r.status, 404);
});

test('unknown route returns 404 BUSINESS_ERROR; NONE entries are ignored', async () => {
  const { r, body } = await get('/api/v1/nothing');
  assert.equal(r.status, 404);
  assert.equal(body.errorCode, 'BUSINESS_ERROR');
  assert.equal((await get('/-')).r.status, 404);
});

test('scenario routes win over fallback and can be switched via admin API', async () => {
  assert.deepEqual((await get('/api/v1/scn')).body, { hello: 'world' });
  const sw = await fetch(`${base}/__admin/scenario`, { method: 'POST', body: JSON.stringify({ name: 'other' }) });
  assert.equal(sw.status, 200);
  assert.deepEqual((await get('/api/v1/scn')).body, { hello: 'alt' });
});

test('scenario can be switched with ?scenario= on any request and stays active', async () => {
  await get('/api/v1/hello?scenario=other');
  assert.deepEqual((await get('/api/v1/scn')).body, { hello: 'alt' });
});

test('unknown scenario name is rejected', async () => {
  const r = await fetch(`${base}/__admin/scenario`, { method: 'POST', body: JSON.stringify({ name: 'nope' }) });
  assert.equal(r.status, 400);
});

test('sequence arrays return in order and repeat the last', async () => {
  await get('/api/v1/hello?scenario=other');
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push((await get('/api/v1/seq')).body.n);
  assert.deepEqual(seen, [1, 2, 2]);
  await fetch(`${base}/__admin/reset`, { method: 'POST' });
  assert.equal((await get('/api/v1/seq')).body.n, 1);
});

test('wildcard segments match exactly one segment, most specific first', async () => {
  await get('/api/v1/hello?scenario=other');
  assert.deepEqual((await get('/api/v1/items/abc')).body, { hello: 'world' });
  assert.deepEqual((await get('/api/v1/items/abc/detail')).body, { hello: 'alt' });
});

test('missing fixture file logs a warning and returns 500 MOCK_MISSING_FIXTURE', async () => {
  const { r, body } = await get('/api/v1/ghost');
  assert.equal(r.status, 500);
  assert.equal(body.errorCode, 'MOCK_MISSING_FIXTURE');
});

test('uses manifest status, headers and error bodies', async () => {
  await get('/api/v1/hello?scenario=default');
  const hdr = await get('/api/v1/hdr');
  assert.equal(hdr.r.status, 429);
  assert.equal(hdr.r.headers.get('retry-after'), '3');
  const created = await fetch(`${base}/api/v1/things`, { method: 'POST', body: '{}' });
  assert.equal(created.status, 201);
});

test('_raw and _contentType produce non-JSON responses; empty raw gives no body', async () => {
  const html = await fetch(`${base}/api/v1/html`);
  assert.equal(html.status, 502);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.equal(await html.text(), '<html>oops</html>');
  const del = await fetch(`${base}/api/v1/thing`, { method: 'DELETE' });
  assert.equal(del.status, 204);
  assert.equal(await del.text(), '');
});

test('delayMs delays the response', async () => {
  const t = Date.now();
  await get('/api/v1/slow');
  assert.ok(Date.now() - t >= 140);
});

test('_fault disconnect destroys the socket', async () => {
  await assert.rejects(fetch(`${base}/api/v1/disc`));
});

test('_fault timeout holds the connection until the client gives up', async () => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  await assert.rejects(fetch(`${base}/api/v1/timeout`, { signal: ac.signal }), /abort/i);
  assert.equal((await get('/api/v1/hello')).r.status, 200);
});

test('_fault timeout closes the connection after the hold period', async () => {
  const t = Date.now();
  await assert.rejects(fetch(`${base}/api/v1/timeout`));
  assert.ok(Date.now() - t >= 350);
});

test('request log records method, path, query, authorization and json body', async () => {
  await fetch(`${base}/api/v1/things?x=1`, { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ a: 1 }) });
  const log = await (await fetch(`${base}/__admin/requests`)).json();
  assert.equal(log.length, 1);
  assert.equal(log[0].method, 'POST');
  assert.equal(log[0].path, '/api/v1/things');
  assert.deepEqual(log[0].query, { x: '1' });
  assert.equal(log[0].headers.authorization, 'Bearer t');
  assert.deepEqual(log[0].body, { a: 1 });
  await fetch(`${base}/__admin/reset`, { method: 'POST' });
  assert.deepEqual(await (await fetch(`${base}/__admin/requests`)).json(), []);
});

test('PUT /__upload/<id> accepts any body and records upload metadata', async () => {
  const bytes = Buffer.alloc(1234, 7);
  const r = await fetch(`${base}/__upload/55555555-5555-4555-8555-555555555501?X-Amz-Expires=300`, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: bytes });
  assert.equal(r.status, 200);
  const ups = await (await fetch(`${base}/__admin/uploads`)).json();
  assert.deepEqual(ups, [{ uploadId: '55555555-5555-4555-8555-555555555501', contentType: 'image/webp', bytes: 1234 }]);
});

test('CORS preflight is answered for web clients', async () => {
  const r = await fetch(`${base}/api/v1/hello`, { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('scenario keys may constrain query params; more specific keys win', async () => {
  await get('/api/v1/hello?scenario=other');
  assert.deepEqual((await get('/api/v1/q?page=2')).body, { q: 1 });
  assert.deepEqual((await get('/api/v1/q?page=1')).body, { q: 1 });
});

test('fallback prefers fixtures named __ok / __success over the first 2xx', async () => {
  assert.deepEqual((await get('/api/v1/pref')).body, { pick: 'ok' });
});

test('shipped default scenario only references fixtures listed in the manifest (when present)', async () => {
  const shared = path.resolve(import.meta.dirname, '../..');
  const manifestFile = path.join(shared, 'fixtures/manifest.json');
  if (!fs.existsSync(manifestFile)) return;
  const known = new Set(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).map((e) => e.fixture));
  const scenario = JSON.parse(fs.readFileSync(path.join(shared, 'mock-server/scenarios/default.json'), 'utf8'));
  const missing = Object.values(scenario).flat().filter((f) => !known.has(f));
  assert.deepEqual(missing, []);
});

test('wildcard scenario routes do not shadow an exact manifest path', async () => {
  await fetch(`${base}/__admin/scenario`, { method: 'POST', body: JSON.stringify({ name: 'other' }) });
  assert.deepEqual((await get('/api/v1/things/calendar?year=2026')).body, { cal: true });
  assert.deepEqual((await get('/api/v1/things/abc')).body, { wild: true });
});

test('presigned URLs are rewritten to the request Host header (JSON and raw bodies)', async () => {
  // fetch forbids overriding Host; use http.get instead
  const hit = (p) => new Promise((ok) => http.get({ host: '127.0.0.1', port: srv.port, path: p, headers: { host: '10.0.2.2:4010' } }, (r) => {
    let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => ok(t));
  }));
  assert.equal(JSON.parse(await hit('/api/v1/presigned')).uploadUrl, 'http://10.0.2.2:4010/__upload/x?a=1');
  assert.deepEqual(JSON.parse(await hit('/api/v1/presigned')).other, ['http://10.0.2.2:4010/y']);
  assert.equal(await hit('/api/v1/rawurl'), 'see http://10.0.2.2:4010/z');
});
