#!/usr/bin/env node
// Zero-dependency mock server. See shared/README.md.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOT_A_RESPONSE = ['NONE', 'PUSH'];
const NOT_FOUND = { errorCode: 'BUSINESS_ERROR', message: '요청한 API를 찾을 수 없습니다.' };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  // `*` does not cover `Authorization` in browsers, so list it explicitly (preflight echoes the requested headers).
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-expose-headers': 'retry-after, www-authenticate',
};

const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function loadScenarios(dir) {
  const scenarios = {};
  if (!fs.existsSync(dir)) return scenarios;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    scenarios[f.slice(0, -5)] = Object.entries(readJsonFile(path.join(dir, f))).map(([key, target]) => {
      const [method, target_] = key.split(' ');
      const [route, qs = ''] = target_.split('?');
      const segments = route.split('/');
      const query = Object.fromEntries(new URLSearchParams(qs));
      return { key, method, segments, query, wildcards: segments.filter((s) => s === '*').length, target };
    });
  }
  return scenarios;
}

const segmentsMatch = (pattern, actual) =>
  pattern.length === actual.length && pattern.every((p, i) => p === '*' || p === actual[i]);

const isSuccess = (e) => Number.isInteger(e.status) && e.status >= 200 && e.status < 300;
const queryMatches = (want = {}, got) => Object.entries(want).every(([k, v]) => got[k] === String(v));
const prefersOk = (e) => /__(ok|success)/.test(e.fixture);

function sendJson(res, status, body, headers = {}, rewrite = (t) => t) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS, ...headers });
  res.end(rewrite(JSON.stringify(body)));
}

// Fixtures embed presigned URLs as http://localhost:4010; answer with the host the client actually used
// (e.g. 10.0.2.2:4010 from an Android emulator) so those URLs stay reachable.
const FIXTURE_ORIGIN = 'http://localhost:4010';
const hostRewriter = (req) => {
  const host = req.headers.host;
  return host ? (text) => text.replaceAll(FIXTURE_ORIGIN, `http://${host}`) : (text) => text;
};

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', () => resolve(Buffer.concat(chunks)));
});

function parseBody(buf) {
  if (buf.length === 0) return null;
  const text = buf.toString('utf8');
  try { return JSON.parse(text); } catch { return text; }
}

export function createMockServer({ fixturesDir, scenariosDir = path.join(HERE, 'scenarios'), faultHoldMs = 30000, logger = console } = {}) {
  const manifestFile = path.join(fixturesDir, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? readJsonFile(manifestFile) : [];
  const scenarios = loadScenarios(scenariosDir);
  const state = { scenario: 'default', requests: [], uploads: [], counters: new Map() };

  const entryFor = (fixture) => manifest.find((e) => e.fixture === fixture);

  // Most specific wins: fewer wildcard segments, then more query constraints.
  function findScenarioRoute(method, segments, query, { exact }) {
    const routes = scenarios[state.scenario] ?? [];
    return routes
      .filter((r) => (r.wildcards === 0) === exact)
      .filter((r) => r.method === method && segmentsMatch(r.segments, segments) && queryMatches(r.query, query))
      .sort((a, b) => a.wildcards - b.wildcards || Object.keys(b.query).length - Object.keys(a.query).length)[0];
  }

  function pickFromSequence(route) {
    if (!Array.isArray(route.target)) return route.target;
    const k = `${state.scenario}|${route.key}`;
    const n = state.counters.get(k) ?? 0;
    state.counters.set(k, n + 1);
    return route.target[Math.min(n, route.target.length - 1)];
  }

  function findFallback(method, pathname, query) {
    const matches = manifest.filter((e) => e.method === method && e.path === pathname && isSuccess(e) && queryMatches(e.query, query));
    const withQuery = matches.filter((e) => e.query && Object.keys(e.query).length);
    const pool = withQuery.length ? withQuery : matches;
    return pool.find(prefersOk) ?? pool[0];
  }

  const hasManifestPath = (method, pathname) => manifest.some((e) => e.method === method && e.path === pathname);

  const fromRoute = (route) => {
    const fixture = pickFromSequence(route);
    return { fixture, entry: entryFor(fixture) };
  };

  // Order: exact scenario route, manifest exact-path fallback, then wildcard scenario route.
  // A wildcard never shadows a path the manifest knows exactly (e.g. posts/* vs posts/calendar).
  function resolve(method, pathname, query) {
    const segments = pathname.split('/');
    const exactRoute = findScenarioRoute(method, segments, query, { exact: true });
    if (exactRoute) return fromRoute(exactRoute);
    const entry = findFallback(method, pathname, query);
    if (entry) return { fixture: entry.fixture, entry };
    if (hasManifestPath(method, pathname)) return null;
    const wildcardRoute = findScenarioRoute(method, segments, query, { exact: false });
    return wildcardRoute ? fromRoute(wildcardRoute) : null;
  }

  function sendFixture(req, res, fixture, entry) {
    const file = path.resolve(fixturesDir, fixture);
    if (!file.startsWith(path.resolve(fixturesDir) + path.sep) || !fs.existsSync(file)) {
      logger.warn(`[mock] missing fixture: ${fixture}`);
      return sendJson(res, 500, { errorCode: 'MOCK_MISSING_FIXTURE', message: `fixture not found: ${fixture}` });
    }
    const body = readJsonFile(file);
    const respond = () => writeFixture(req, res, body, entry);
    if (!entry?.delayMs) return respond();
    const timer = setTimeout(respond, entry.delayMs);
    req.socket.once('close', () => clearTimeout(timer));
  }

  function writeFixture(req, res, body, entry) {
    if (body._fault === 'disconnect') return req.socket.destroy();
    if (body._fault === 'timeout') return hold(req, res);
    const status = entry?.status ?? 200;
    const headers = { ...CORS, ...(entry?.headers ?? {}) };
    if (body._raw !== undefined) {
      res.writeHead(status, body._raw === '' ? headers : { 'content-type': body._contentType ?? 'text/plain', ...headers });
      return res.end(hostRewriter(req)(body._raw));
    }
    sendJson(res, status, body, headers, hostRewriter(req));
  }

  function hold(req, res) {
    const timer = setTimeout(() => req.socket.destroy(), faultHoldMs);
    res.on('close', () => clearTimeout(timer));
    req.socket.on('close', () => clearTimeout(timer));
  }

  async function handleAdmin(req, res, pathname, buf) {
    const route = `${req.method} ${pathname}`;
    if (route === 'GET /__admin/requests') return sendJson(res, 200, state.requests);
    if (route === 'GET /__admin/uploads') return sendJson(res, 200, state.uploads);
    if (route === 'GET /__admin/scenario') return sendJson(res, 200, { name: state.scenario, available: Object.keys(scenarios) });
    if (route === 'POST /__admin/reset') {
      Object.assign(state, { requests: [], uploads: [], counters: new Map() });
      return sendJson(res, 200, { ok: true });
    }
    if (route === 'POST /__admin/scenario') {
      const name = parseBody(buf)?.name;
      if (!setScenario(name)) return sendJson(res, 400, { errorCode: 'MOCK_UNKNOWN_SCENARIO', message: `unknown scenario: ${name}` });
      return sendJson(res, 200, { name });
    }
    return sendJson(res, 404, NOT_FOUND);
  }

  function setScenario(name) {
    if (name !== 'default' && !scenarios[name]) return false;
    if (name !== state.scenario) state.counters = new Map();
    state.scenario = name;
    return true;
  }

  function handleUpload(req, res, url, buf) {
    const uploadId = url.pathname.slice('/__upload/'.length);
    state.uploads.push({ uploadId, contentType: req.headers['content-type'] ?? null, bytes: buf.length });
    res.writeHead(200, { ...CORS, etag: '"mock"' });
    res.end();
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const query = Object.fromEntries(url.searchParams);
    if (req.method === 'OPTIONS') {
      const requested = req.headers['access-control-request-headers'];
      res.writeHead(204, { ...CORS, ...(requested ? { 'access-control-allow-headers': requested } : {}) });
      return res.end();
    }
    const buf = await readBody(req);
    if (url.pathname.startsWith('/__admin/')) return handleAdmin(req, res, url.pathname, buf);
    if (query.scenario && !setScenario(query.scenario)) logger.warn(`[mock] unknown scenario: ${query.scenario}`);
    const { scenario: _ignored, ...cleanQuery } = query;
    const isUpload = req.method === 'PUT' && url.pathname.startsWith('/__upload/');
    // upload bodies are binary image bytes: record the size in /__admin/uploads, not the bytes here
    state.requests.push({ method: req.method, path: url.pathname, query: cleanQuery, headers: req.headers, body: isUpload ? null : parseBody(buf) });
    if (isUpload) return handleUpload(req, res, url, buf);
    const hit = resolve(req.method, url.pathname, cleanQuery);
    if (!hit) return sendJson(res, 404, NOT_FOUND);
    return sendFixture(req, res, hit.fixture, hit.entry);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      logger.warn(`[mock] handler error: ${err.stack}`);
      if (!res.headersSent) sendJson(res, 500, { errorCode: 'MOCK_INTERNAL', message: String(err.message) });
    });
  });

  return {
    server,
    state,
    get port() { return server.address()?.port; },
    listen: (port) => new Promise((ok) => server.listen(port, '0.0.0.0', ok)),
    close: () => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixturesDir = path.resolve(HERE, '../fixtures');
  const mock = createMockServer({ fixturesDir });
  const port = Number(process.env.PORT ?? 4010);
  await mock.listen(port);
  console.log(`[mock] listening on :${port} (fixtures: ${fixturesDir})`);
}
