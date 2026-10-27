#!/usr/bin/env node
// Smoke test of the public (no-login) dev API. Run manually or daily: node shared/scripts/dev-smoke.mjs
import { fileURLToPath } from 'node:url';
import { findSchema, validateShape } from './schemas.mjs';

const KST_OFFSET_MS = 9 * 3600 * 1000;

export const kstToday = (now = new Date()) => new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

async function check(name, url, fetchFn) {
  const { pathname } = new URL(url);
  try {
    const res = await fetchFn(url, { headers: { accept: 'application/json' } });
    if (res.status !== 200) return { name, ok: false, errors: [`HTTP ${res.status} (expected 200)`] };
    const schema = findSchema('GET', pathname, res.status);
    const errors = schema ? validateShape(await res.json(), schema) : ['no schema registered'];
    return { name, ok: errors.length === 0, errors };
  } catch (err) {
    return { name, ok: false, errors: [`request failed: ${err.message}`] };
  }
}

export async function runSmoke({ base = 'https://chalkak-dev.pysun.kr', fetchFn = fetch, now = new Date() } = {}) {
  const date = kstToday(now);
  const api = `${base.replace(/\/$/, '')}/api/v1`;
  return Promise.all([
    check('GET /topics', `${api}/topics?date=${date}`, fetchFn),
    check('GET /posts', `${api}/posts?topicDate=${date}&sort=recent&page=1&pageSize=20`, fetchFn),
    check('GET /banners', `${api}/banners?page=1&pageSize=10`, fetchFn),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const results = await runSmoke({ base: process.env.BASE });
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.errors.length ? `\n      ${r.errors.join('\n      ')}` : ''}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
