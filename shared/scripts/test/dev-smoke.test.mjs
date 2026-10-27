import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke, kstToday } from '../dev-smoke.mjs';

const json = (status, body) => async () => ({ status, json: async () => body, text: async () => JSON.stringify(body) });

test('kstToday rolls over at 15:00Z', () => {
  assert.equal(kstToday(new Date('2026-10-26T14:59:59Z')), '2026-10-26');
  assert.equal(kstToday(new Date('2026-10-26T15:00:00Z')), '2026-10-27');
});

test('runSmoke calls the three public endpoints and validates shapes', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(String(url));
    if (url.includes('/topics')) return json(200, { id: 'i', title: 't', topicDate: '2026-10-27', startsAt: 'a', endsAt: 'b', phase: 'OPEN' })();
    if (url.includes('/banners')) return json(200, { currentPage: 1, pageSize: 10, hasNext: false, banners: [] })();
    return json(200, { currentPage: 1, pageSize: 20, hasNext: false, randomSeed: null, posts: [] })();
  };
  const res = await runSmoke({ base: 'https://x.test', fetchFn, now: new Date('2026-10-27T03:00:00Z') });
  assert.equal(res.length, 3);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
  assert.ok(calls.some((c) => c.includes('/api/v1/topics?date=2026-10-27')));
  assert.ok(calls.some((c) => c.includes('/api/v1/posts?topicDate=2026-10-27')));
});

test('runSmoke reports shape errors, bad status and network failures', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/topics')) return json(200, { id: 1 })();
    if (url.includes('/banners')) throw new Error('boom');
    return json(500, { errorCode: 'INTERNAL_ERROR', message: 'x' })();
  };
  const res = await runSmoke({ base: 'https://x.test', fetchFn, now: new Date('2026-10-27T03:00:00Z') });
  assert.deepEqual(res.map((r) => r.ok), [false, false, false]);
  assert.match(res[0].errors.join(' '), /id/);
  assert.match(res[2].errors.join(" "), /boom/);
  assert.match(res[1].errors.join(" "), /500/);
});
