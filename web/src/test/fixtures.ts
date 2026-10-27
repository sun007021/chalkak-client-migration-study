import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import shared from '../../../shared/constants.json';
import type { AuthTokens, StoredSession } from '../core/auth/SessionStore';

/** shared/fixtures를 읽는다. 규약은 shared/fixtures/README.md: 파일은 응답 본문이고 상태·헤더는 manifest.json에 있다. */
const FIXTURE_ROOT = join(__dirname, '..', '..', '..', 'shared', 'fixtures');

interface ManifestEntry {
  fixture: string;
  status?: number;
  headers?: Record<string, string>;
}

let manifestCache: ManifestEntry[] | null = null;
function manifestEntry(path: string): ManifestEntry | undefined {
  manifestCache ??= JSON.parse(readFileSync(join(FIXTURE_ROOT, 'manifest.json'), 'utf8')) as ManifestEntry[];
  return manifestCache.find((e) => e.fixture === path);
}

export interface LoadedFixture {
  /** 응답 본문 문자열. `_raw`가 있으면 그 값, 아니면 JSON 직렬화. */
  text: string;
  /** `_raw`가 없으면 파싱한 JSON. */
  json: unknown;
  contentType: string | null;
  status: number;
  headers: Record<string, string>;
  /** fetch 응답으로 만든다(이름 그대로 새 Response). */
  toResponse(overrides?: { status?: number; headers?: Record<string, string> }): Response;
}

/** `common/error__business-400.json` 같은 상대 경로로 fixture를 읽는다. `_raw`/`_contentType` 예약 키를 처리한다. */
export function loadFixture(path: string): LoadedFixture {
  const parsed = JSON.parse(readFileSync(join(FIXTURE_ROOT, path), 'utf8')) as Record<string, unknown>;
  const hasRaw = typeof parsed._raw === 'string';
  const text = hasRaw ? (parsed._raw as string) : JSON.stringify(parsed);
  const contentType = hasRaw ? ((parsed._contentType as string | undefined) ?? null) : 'application/json';
  const entry = manifestEntry(path);
  const status = entry?.status ?? 200;
  const headers = entry?.headers ?? {};
  return {
    text,
    json: hasRaw ? undefined : parsed,
    contentType,
    status,
    headers,
    toResponse(overrides = {}) {
      const h: Record<string, string> = { ...headers, ...overrides.headers };
      if (contentType) h['content-type'] = contentType;
      const code = overrides.status ?? status;
      return new Response(code === 204 || code === 304 ? null : text, { status: code, headers: h });
    },
  };
}

function jsonOf(path: string): Record<string, unknown> {
  return loadFixture(path).json as Record<string, unknown>;
}

export const errorBodies = {
  business400: jsonOf('common/error__business-400.json'),
  unknownCode: jsonOf('common/error__unknown-error-code.json'),
  resourceStateChanged: jsonOf('common/error__resource-state-changed.json'),
  /** shared에 없는 코드(API §5)라 인라인으로 둔다. */
  metricsAggregation: { errorCode: 'USER_METRICS_AGGREGATION_IN_PROGRESS', message: '집계 중입니다.' },
  unauthorized: jsonOf('common/error__unauthorized-token-invalid.json'),
  reauth: jsonOf('auth/refresh__reauthentication-required.json'),
  forbiddenBanned: jsonOf('common/error__forbidden-banned.json'),
  forbiddenNoPermission: jsonOf('common/error__forbidden-no-permission.json'),
  notFoundApi: jsonOf('common/error__not-found-api.json'),
  validationFormat: jsonOf('common/error__validation-format.json'),
  internal500: jsonOf('common/error__internal-500.json'),
} as const;

export const gatewayHtml = loadFixture('common/error__bad-gateway-html.json').text;

export const refreshSuccessBody = jsonOf('auth/refresh__success.json');

/** 기준 시각(constants.json FIXTURE_NOW, KST 2026-10-27 12:00). */
export const NOW = Date.parse(shared.FIXTURE_NOW);

export const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function tokens(overrides: Partial<AuthTokens> = {}): AuthTokens {
  return {
    accessToken: 'fixture-access-token-1',
    accessTokenExpiresAt: NOW + 900_000,
    refreshToken: 'fixture-refresh-token-1',
    refreshTokenExpiresAt: NOW + 2_592_000_000,
    ...overrides,
  };
}

export function memberSession(overrides: Partial<AuthTokens> = {}): StoredSession {
  return { userId: ME, tokens: tokens(overrides), isGuest: false };
}

export const guestSession: StoredSession = { userId: null, tokens: null, isGuest: true };

export const BASE = '/api/v1/';
