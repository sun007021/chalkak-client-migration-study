import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSchema, validateShape } from '../schemas.mjs';

const ID = '22222222-2222-4222-8222-222222222201';

test('validateShape reports missing and mistyped required keys', () => {
  const schema = { props: { a: 'string', 'b?': 'number', c: 'string|null' } };
  assert.deepEqual(validateShape({ a: 'x', c: null }, schema), []);
  assert.equal(validateShape({ c: null }, schema).length, 1);
  assert.match(validateShape({ a: 1, c: null }, schema)[0], /a/);
  assert.match(validateShape({ a: 'x', b: 'n', c: null }, schema)[0], /b/);
  assert.equal(validateShape({ a: 'x' }, schema).length, 1);
});

test('validateShape recurses into arrays and objects', () => {
  const schema = { props: { list: { type: 'array', items: { props: { id: 'string' } } } } };
  assert.deepEqual(validateShape({ list: [{ id: 'a' }] }, schema), []);
  assert.match(validateShape({ list: [{ id: 'a' }, {}] }, schema)[0], /list\[1\]\.id/);
});

test('findSchema matches method, path pattern and status', () => {
  assert.ok(findSchema('POST', '/api/v1/auth/social-login', 200));
  assert.ok(findSchema('GET', '/api/v1/posts/today', 200));
  assert.ok(findSchema('GET', '/api/v1/posts', 200));
  assert.ok(findSchema('GET', `/api/v1/posts/${ID}`, 200));
  assert.ok(findSchema('GET', '/api/v1/topics', 200));
  assert.ok(findSchema('GET', '/api/v1/banners', 200));
  assert.ok(findSchema('GET', '/api/v1/posts/calendar', 200));
  assert.ok(findSchema('GET', '/api/v1/notifications', 200));
  assert.ok(findSchema('GET', '/api/v1/notifications/unread-status', 200));
  assert.ok(findSchema('GET', `/api/v1/posts/${ID}/ai-review`, 200));
  assert.ok(findSchema('POST', `/api/v1/posts/${ID}/ai-review`, 202));
  assert.ok(findSchema('POST', '/api/v1/posts/uploads', 200));
  assert.ok(findSchema('POST', '/api/v1/auth/refresh', 200));
  assert.equal(findSchema('GET', '/api/v1/posts/today', 401), null);
  assert.equal(findSchema('GET', '/api/v1/unknown', 200), null);
});

test('social-login: SIGN_UP_REQUIRED needs only status, LOGIN_SUCCESS needs tokens', () => {
  const s = findSchema('POST', '/api/v1/auth/social-login', 200);
  assert.deepEqual(validateShape({ status: 'SIGN_UP_REQUIRED' }, s), []);
  assert.ok(validateShape({ status: 'LOGIN_SUCCESS' }, s).length > 0);
  const ok = { status: 'LOGIN_SUCCESS', userId: ID, accessToken: 'a', expiresIn: 900, refreshToken: 'r', refreshTokenExpiresIn: 1 };
  assert.deepEqual(validateShape(ok, s), []);
});

test('findSchema does not mutate the shared schema objects', () => {
  const a = findSchema('POST', '/api/v1/posts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ai-review', 200);
  const b = findSchema('GET', '/api/v1/posts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/ai-review', 200);
  assert.equal(a.name, 'ai-review-request');
  assert.equal(b.name, 'ai-review');
});
