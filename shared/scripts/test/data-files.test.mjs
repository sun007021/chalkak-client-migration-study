import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const load = (rel) => JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'));

test('constants.json holds the 00-overview section 6 values', () => {
  const c = load('../../constants.json');
  assert.equal(c.SERVICE_TIME_ZONE, 'Asia/Seoul');
  assert.equal(c.FIRST_TOPIC_DATE, '2026-09-17');
  assert.equal(c.POST_TITLE_MAX, 10);
  assert.equal(c.FEEDBACK_MAX, 1000);
  assert.equal(c.FEEDBACK_MIN, 1);
  assert.equal(c.POST_IMAGE_CONTENT_TYPE, 'image/webp');
  assert.equal(c.POST_IMAGE_MAX_BYTES, 5242880);
  assert.equal(c.POST_IMAGE_MAX_LONG_EDGE, 4096);
  assert.deepEqual(c.WEBP_QUALITY_LADDER, [90, 80, 60, 40]);
  assert.equal(c.WEBP_DOWNSCALE_FACTOR, 0.85);
  assert.equal(c.WEBP_DOWNSCALE_MAX_ATTEMPTS, 3);
  assert.equal(c.UPLOAD_URL_SAFETY_MARGIN_MS, 5000);
  assert.deepEqual(c.SIGNATURE_PNG_SIZE, { width: 1024, height: 512, padding: 48, strokeWidth: 14 });
  assert.equal(c.SIGNATURE_MAX_BYTES, 1048576);
  assert.deepEqual([c.SIGNUP_PENDING_RETRY_INTERVAL_MS, c.SIGNUP_PENDING_RETRY_MAX], [1000, 10]);
  assert.equal(c.AI_REVIEW_POLL_INTERVAL_MS, 3000);
  assert.equal(c.AI_REVIEW_POLL_WINDOW_MS, 300000);
  assert.equal(c.PAGE_SIZE, 20);
  assert.equal(c.BANNER_PAGE_SIZE, 10);
  assert.equal(c.TOAST_DURATION_MS, 2500);
  assert.equal(c.SPLASH_PRELOAD_MAX_MS, 700);
});

test('constants.json holds network and terms constants from decisions', () => {
  const c = load('../../constants.json');
  assert.equal(c.HTTP_CONNECT_TIMEOUT_MS, 10000);
  assert.equal(c.HTTP_RESPONSE_TIMEOUT_MS, 15000);
  assert.equal(c.UPLOAD_PUT_TIMEOUT_MS, 60000);
  assert.deepEqual(c.RETRY_BACKOFF_MS, [500, 1000]);
  assert.deepEqual(c.TERMS_ALLOWED_HOSTS, ['notion.com', 'notion.so', 'notion.site']);
  assert.ok(c.TERMS_URLS && 'service' in c.TERMS_URLS && 'privacy' in c.TERMS_URLS);
});

test('ko.json is a flat map of dotted keys to non-empty strings', () => {
  const ko = load('../../copy/ko.json');
  const keys = Object.keys(ko);
  assert.ok(keys.length >= 150, `only ${keys.length} keys`);
  for (const k of keys) {
    assert.match(k, /^[a-z]+(\.[a-z0-9-]+)+$/, k);
    assert.equal(typeof ko[k], 'string', k);
    assert.ok(ko[k].length > 0, k);
  }
});

test('ko.json spot checks of verbatim copy', () => {
  const ko = load('../../copy/ko.json');
  assert.equal(ko['nav.guest.record'], '기록을 보려면 로그인이 필요해요');
  assert.equal(ko['like.error.generic'], '좋아요를 반영하지 못했어요');
  assert.equal(ko['common.error.network'], '네트워크 연결을 확인해 주세요.');
  assert.equal(ko['boot.update.title'], '업데이트가 필요해요');
});

test('ko.json has no invented duplicate keys (only keys from the feature docs copy tables remain)', () => {
  const ko = load('../../copy/ko.json');
  const removed = ['banned.ai-review', 'banned.like', 'like.banned', 'banned.signature', 'banned.title-edit', 'banned.upload', 'network.offline',
    'record.picker.confirm', 'auth.login.title', 'auth.session-expired', 'banner.web.title', 'update.body', 'update.button', 'update.title',
    'display.like-failed', 'like.failed', 'feed.edit.title-required', 'guest.feed-login-required', 'guest.feedback-login-required',
    'guest.like-login-required', 'guest.notification-login-required', 'guest.record-login-required', 'guest.upload-login-required',
    'record.title', 'time.weekday'];
  for (const k of removed) assert.ok(!(k in ko), `${k} should be removed`);
});

test('every key in the feature docs copy tables exists in ko.json', () => {
  const ko = load('../../copy/ko.json');
  const dir = new URL('../../../docs/spec/features/', import.meta.url);
  const placeholders = new Set(['ai.error.server-message']); // shows the server message verbatim, no fixed copy
  const missing = [];
  for (const name of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(new URL(name, dir), 'utf8').split('\n')) {
      const m = line.match(/^\| ([a-z]+\.[a-z0-9._-]+) \| /);
      if (m && !placeholders.has(m[1]) && !(m[1] in ko)) missing.push(`${name}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
