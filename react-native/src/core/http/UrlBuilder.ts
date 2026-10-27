export type QueryValue = string | number | boolean | undefined | null;

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ANYWHERE = new RegExp(UUID_SOURCE, 'gi');
const UUID_WHOLE = new RegExp(`^${UUID_SOURCE}$`, 'i');

const lowerIfUuid = (value: string): string =>
  UUID_WHOLE.test(value) ? value.toLowerCase() : value;

/** base(끝 `/` 포함)에 path와 query를 붙인다. undefined/null 쿼리는 생략, 숫자는 로캘 무관 10진수, UUID는 소문자. */
export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const lowerPath = path.replace(/^\/+/, '').replace(UUID_ANYWHERE, (m) => m.toLowerCase());
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(lowerIfUuid(String(value)))}`);
  }
  return `${base}/${lowerPath}${pairs.length > 0 ? `?${pairs.join('&')}` : ''}`;
}

/** JSON 바디 안의 UUID 형태 문자열을 소문자 정규형으로 바꾼 복사본을 돌려준다. */
export function normalizeBodyUuids<T>(body: T): T {
  return normalize(body) as T;
}

function normalize(value: unknown): unknown {
  if (typeof value === 'string') return lowerIfUuid(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

/** 쿼리 문자열과 해시를 제거한 URL(로그용). */
export function stripQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}
