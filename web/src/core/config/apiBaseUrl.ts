import { ConfigError } from '../net/errors';

/** 검증된 기준 주소. 서버 origin에 `/api/v1`을 붙인 값이며 항상 '/'로 끝난다(예: `https://x.test/api/v1/`). REQ-NET-003. */
export type ApiBaseUrl = string & { readonly __brand: 'ApiBaseUrl' };

export interface ConfigEnv {
  /** 현재 페이지 출처(기본 globalThis.location.origin). same-origin 특례에서 쓴다. */
  pageOrigin?: string;
}

/**
 * REQ-NET-001/002/003. 입력은 서버 origin만(경로 없음, '/' 하나는 허용). 앱이 `/api/v1/`을 붙인다.
 * 허용: https://host[:port], loopback(localhost, 127.0.0.1)의 http.
 * Web 특례: undefined/빈 문자열/'same-origin'이면 pageOrigin(Vite 프록시 경유)을 쓴다. pageOrigin도 위 규칙을 통과해야 한다.
 * 거부(ConfigError): 그 밖의 http, 다른 스킴, 스킴 없음, 경로·쿼리·fragment 포함, 형식 오류. 개발 서버 주소로 대체하지 않는다.
 */
export function parseApiBaseUrl(_raw: string | undefined, _env?: ConfigEnv): ApiBaseUrl {
  throw new Error('not implemented');
}

/** import.meta.env 같은 환경 객체에서 VITE_API_BASE_URL을 읽어 검증한다. */
export function readApiBaseUrl(_env: { VITE_API_BASE_URL?: string }, _configEnv?: ConfigEnv): ApiBaseUrl {
  throw new Error('not implemented');
}

/** presigned 업로드 URL 등 절대 URL도 같은 규칙: https 또는 loopback http만. 아니면 ConfigError. */
export function assertAllowedAbsoluteUrl(_url: string): void {
  throw new Error('not implemented');
}

export { ConfigError };
