import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTestIds, extractLiterals, findUnknown } from '../check-testids.mjs';

const MD = `## 3. 화면별 식별자

| 화면 | 요소 | testID | 비고 |
| --- | --- | --- | --- |
| login | 루트 | \`login.root\` |  |
| home | 칸 | \`home.week-day-{yyyy-mm-dd}\` | 7칸 |
`;

test('parseTestIds reads ids and compiles templates', () => {
  const ids = parseTestIds(MD);
  assert.deepEqual(ids.map((i) => i.id), ['login.root', 'home.week-day-{yyyy-mm-dd}']);
  assert.ok(ids[1].regex.test('home.week-day-2026-10-27'));
  assert.ok(!ids[1].regex.test('home.week-day-'));
});

test('extractLiterals finds ids per platform idiom', () => {
  const src = [
    'Modifier.testTag("login.root")',
    '.accessibilityIdentifier("home.week-day-\\(date)")',
    '<View testID="login.kakao-button" />',
    '<div data-testid={`home.week-day-${d}`} />',
    "Semantics(identifier: 'login.root', child: x)",
    "key: const Key('login.guest-button')",
    'val name = "image.webp"',
  ].join('\n');
  assert.deepEqual(extractLiterals(src).map((l) => l.literal), [
    'login.root', 'home.week-day-{}', 'login.kakao-button', 'home.week-day-{}', 'login.root', 'login.guest-button',
  ]);
});

test('findUnknown flags ids missing from the table, accepts templated literals', () => {
  const ids = parseTestIds(MD);
  const files = { 'a.tsx': '<View testID="login.root"/><View testID="login.nope"/><i data-testid={`home.week-day-${d}`}/>' };
  const unknown = findUnknown(files, ids);
  assert.deepEqual(unknown.map((u) => [u.file, u.literal, u.line]), [['a.tsx', 'login.nope', 1]]);
});

test('extractLiterals does not treat object fields ending in Key as testIDs', () => {
  const src = [
    "const a = { copyKey: 'common.error-network' };",
    "final k = Key('login.kakao-button');",
    "final v = ValueKey('home.root');",
    "val apiKey = \"home.root\"",
  ].join('\n');
  assert.deepEqual(extractLiterals(src).map((x) => x.literal), ['login.kakao-button', 'home.root']);
});
