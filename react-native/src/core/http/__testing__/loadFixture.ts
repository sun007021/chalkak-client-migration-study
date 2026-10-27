import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HttpResponse } from '../HttpTransport';

// react-native/src/core/http/__testing__ -> 저장소 루트의 shared/fixtures
const FIXTURES_DIR = join(__dirname, '..', '..', '..', '..', '..', 'shared', 'fixtures');

type ManifestEntry = { fixture: string; status?: number; headers?: Record<string, string> };

let manifestCache: ManifestEntry[] | undefined;
const manifest = (): ManifestEntry[] =>
  (manifestCache ??= JSON.parse(readFileSync(join(FIXTURES_DIR, 'manifest.json'), 'utf8')));

/** `common/error__internal-500`처럼 영역/이름(확장자 없이)으로 fixture 파일의 JSON을 읽는다. */
export function loadFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8')) as T;
}

/** fixture 본문(예약 키가 없는 일반 JSON). */
export const fixtureBody = <T = Record<string, unknown>>(name: string): T => loadFixture<T>(name);

/**
 * fixture를 HttpResponse로 만든다. 상태 코드·헤더는 manifest, 본문은 파일(`_raw`/`_contentType` 예약 키 처리).
 * `headers`로 manifest 헤더를 덮어쓸 수 있다(헤더 키는 소문자로 바꾼다).
 */
export function fixtureResponse(name: string, headers: Record<string, string> = {}): HttpResponse {
  const entry = manifest().find((e) => e.fixture === `${name}.json`);
  if (entry?.status === undefined) throw new Error(`manifest에 상태가 없는 fixture: ${name}`);
  const file = loadFixture<Record<string, unknown>>(name);
  const merged = { ...(entry.headers ?? {}), ...headers };
  const lowered = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k.toLowerCase(), v]));
  if (typeof file._raw === 'string') {
    const contentType = typeof file._contentType === 'string' ? file._contentType : undefined;
    return {
      status: entry.status,
      headers: { ...(contentType ? { 'content-type': contentType } : {}), ...lowered },
      bodyText: file._raw,
    };
  }
  return {
    status: entry.status,
    headers: { 'content-type': 'application/json', ...lowered },
    bodyText: JSON.stringify(file),
  };
}
