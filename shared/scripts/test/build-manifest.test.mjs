import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildManifest, writeManifest, checkManifest } from '../build-manifest.mjs';

function tmpFixtures(routes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-'));
  for (const [area, entries] of Object.entries(routes)) {
    fs.mkdirSync(path.join(dir, area));
    fs.writeFileSync(path.join(dir, area, '_routes.json'), JSON.stringify(entries));
  }
  return dir;
}
const e = (fixture) => ({ fixture, method: 'GET', path: '/api/v1/x', status: 200 });

test('buildManifest merges all areas sorted by fixture path', () => {
  const dir = tmpFixtures({ home: [e('home/b.json'), e('home/a.json')], auth: [e('auth/z.json')] });
  assert.deepEqual(buildManifest(dir).map((x) => x.fixture), ['auth/z.json', 'home/a.json', 'home/b.json']);
});

test('buildManifest ignores areas without _routes.json and rejects non-array routes', () => {
  const dir = tmpFixtures({ home: [e('home/a.json')] });
  fs.mkdirSync(path.join(dir, 'empty'));
  assert.equal(buildManifest(dir).length, 1);
  fs.writeFileSync(path.join(dir, 'home', '_routes.json'), '{}');
  assert.throws(() => buildManifest(dir), /array/);
});

test('buildManifest rejects duplicate fixture entries', () => {
  const dir = tmpFixtures({ home: [e('home/a.json'), e('home/a.json')] });
  assert.throws(() => buildManifest(dir), /duplicate/i);
});

test('checkManifest detects missing, stale and in-sync manifests', () => {
  const dir = tmpFixtures({ home: [e('home/a.json')] });
  assert.equal(checkManifest(dir), false);
  writeManifest(dir);
  assert.equal(checkManifest(dir), true);
  fs.writeFileSync(path.join(dir, 'home', '_routes.json'), JSON.stringify([e('home/a.json'), e('home/b.json')]));
  assert.equal(checkManifest(dir), false);
});
