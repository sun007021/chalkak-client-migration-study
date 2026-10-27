import type { ApiBaseUrl } from '../config/apiBaseUrl';

export type QueryValue = string | number | boolean | null | undefined;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const WHOLE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** baseUrl과 path를 슬래시 중복 없이 잇고 쿼리를 붙인다. undefined/null 값은 생략, 숫자는 로캘과 무관한 ASCII 10진수, UUID처럼 보이는 값은 소문자(TC-NET-052, 053). */
export function buildUrl(baseUrl: ApiBaseUrl, path: string, query?: Record<string, QueryValue>): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const wirePath = path.replace(/^\/+/, '').replace(UUID, (id) => toWireUuid(id));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    const text = typeof value === 'string' ? value : String(value);
    params.append(key, WHOLE_UUID.test(text) ? toWireUuid(text) : text);
  }
  const qs = params.toString();
  return `${base}${wirePath}${qs ? `?${qs}` : ''}`;
}

/** UUID는 서버가 소문자만 허용한다(Swift UUID.uuidString은 대문자). */
export function toWireUuid(id: string): string {
  return id.toLowerCase();
}

/**
 * 경로 템플릿 태그. 보간 값을 경로 세그먼트로 인코딩해 `/`·`?`·`#`이 경로 구조를 바꾸지 못하게 하고 UUID는 소문자로 만든다.
 * 예: path`/posts/${postId}/likes`
 */
export function path(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce((out, chunk, i) => {
    if (i === 0) return chunk;
    const value = String(values[i - 1]);
    return `${out}${encodeURIComponent(WHOLE_UUID.test(value) ? toWireUuid(value) : value)}${chunk}`;
  }, '');
}
