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

/** 경로 한 조각을 인코딩한다(UUID는 소문자). `/`, `?`, `#`, 공백 등이 경로 구조를 깨지 않게 한다. */
export function pathSegment(value: string | number): string {
  return encodeURIComponent(lowerIfUuid(String(value)));
}

/** 태그 함수: apiPath`/posts/${id}/likes`. 보간 값은 pathSegment로 인코딩하고 고정 부분은 그대로 둔다. */
export function apiPath(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return strings.reduce(
    (acc, part, i) => acc + part + (i < values.length ? pathSegment(values[i]) : ''),
    '',
  );
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
