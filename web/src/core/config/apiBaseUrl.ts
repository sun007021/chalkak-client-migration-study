import { ConfigError } from '../net/errors';

/** 검증된 기준 주소. 서버 origin에 `/api/v1`을 붙인 값이며 항상 '/'로 끝난다(예: `https://x.test/api/v1/`). REQ-NET-003. */
export type ApiBaseUrl = string & { readonly __brand: 'ApiBaseUrl' };

export interface ConfigEnv {
  /** 현재 페이지 출처(기본 globalThis.location.origin). same-origin 특례에서 쓴다. */
  pageOrigin?: string;
}

const API_PATH = '/api/v1/';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function parseAllowedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`invalid URL: ${raw}`);
  }
  const allowed = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname));
  if (!allowed) throw new ConfigError(`URL must be https (or http on loopback): ${raw}`);
  if (url.username || url.password) throw new ConfigError('URL must not contain credentials');
  return url;
}

function originOnly(raw: string): string {
  if (/[?#]/.test(raw)) throw new ConfigError(`server origin must not include query or fragment: ${raw}`);
  const url = parseAllowedUrl(raw);
  if (url.pathname !== '/') throw new ConfigError(`server origin must not include a path: ${raw}`);
  return url.origin;
}

/**
 * REQ-NET-001/002/003. 입력은 서버 origin만(경로 없음, '/' 하나는 허용). 앱이 `/api/v1/`을 붙인다.
 * 허용: https://host[:port], loopback(localhost, 127.0.0.1)의 http.
 * Web 특례: undefined/빈 문자열/'same-origin'이면 pageOrigin(Vite 프록시 경유)을 쓴다. pageOrigin도 위 규칙을 통과해야 한다.
 * 거부(ConfigError): 그 밖의 http, 다른 스킴, 스킴 없음, 경로·쿼리·fragment 포함, 형식 오류. 개발 서버 주소로 대체하지 않는다.
 */
export function parseApiBaseUrl(raw: string | undefined, env?: ConfigEnv): ApiBaseUrl {
  const trimmed = raw?.trim() ?? '';
  const sameOrigin = trimmed === '' || trimmed === 'same-origin';
  const source = sameOrigin ? (env?.pageOrigin ?? globalThis.location?.origin ?? '') : trimmed;
  return `${originOnly(source)}${API_PATH}` as ApiBaseUrl;
}

/** import.meta.env 같은 환경 객체에서 VITE_API_BASE_URL을 읽어 검증한다. */
export function readApiBaseUrl(env: { VITE_API_BASE_URL?: string }, configEnv?: ConfigEnv): ApiBaseUrl {
  return parseApiBaseUrl(env.VITE_API_BASE_URL, configEnv);
}

/** presigned 업로드 URL 등 절대 URL도 같은 규칙: https 또는 loopback http만. 아니면 ConfigError. */
export function assertAllowedAbsoluteUrl(url: string): void {
  parseAllowedUrl(url);
}

export { ConfigError };
