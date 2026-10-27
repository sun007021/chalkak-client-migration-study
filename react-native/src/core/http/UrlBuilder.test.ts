import { apiPath, buildUrl, pathSegment, normalizeBodyUuids, stripQuery } from './UrlBuilder';

const BASE = 'https://api.test/api/v1/';
const UPPER = '3F1C2A52-AAAA-4BBB-8CCC-DDDDEEEEFFFF';

describe('buildUrl', () => {
  it('base 끝 슬래시와 경로 앞 슬래시가 겹쳐도 한 번만 들어간다', () => {
    expect(buildUrl(BASE, '/posts')).toBe('https://api.test/api/v1/posts');
  });

  it('TC-NET-053 숫자 쿼리는 로캘과 무관한 10진수 ASCII다', () => {
    const url = buildUrl(BASE, '/posts', { page: 1234567, pageSize: 20, randomSeed: 42 });
    expect(new URL(url).searchParams.get('page')).toBe('1234567');
    expect(url).not.toMatch(/[,٫٠-٩]/);
  });

  it('TC-NET-053 undefined·null 쿼리는 생략한다', () => {
    expect(buildUrl(BASE, '/posts', { a: undefined, b: null, c: 'x' })).toBe(
      'https://api.test/api/v1/posts?c=x',
    );
  });

  it('쿼리 값은 URL 인코딩한다', () => {
    expect(buildUrl(BASE, '/posts', { q: 'a b&c' })).toBe(
      'https://api.test/api/v1/posts?q=a%20b%26c',
    );
  });

  it('TC-NET-052 경로·쿼리의 UUID를 소문자로 만든다', () => {
    const url = buildUrl(BASE, `/posts/${UPPER}`, { id: UPPER });
    expect(url).toBe(
      `https://api.test/api/v1/posts/${UPPER.toLowerCase()}?id=${UPPER.toLowerCase()}`,
    );
  });

  it('TC-NET-052 UUID가 아닌 값의 대소문자는 건드리지 않는다', () => {
    expect(buildUrl(BASE, '/posts', { sort: 'LATEST' })).toContain('sort=LATEST');
  });
});

describe('normalizeBodyUuids', () => {
  it('TC-NET-052 중첩·배열 안의 UUID 문자열만 소문자로 바꾸고 원본은 변경하지 않는다', () => {
    const input = { a: UPPER, list: [UPPER, 'Hello'], nested: { b: UPPER }, n: 1, t: null };
    const result = normalizeBodyUuids(input);
    expect(result).toEqual({
      a: UPPER.toLowerCase(),
      list: [UPPER.toLowerCase(), 'Hello'],
      nested: { b: UPPER.toLowerCase() },
      n: 1,
      t: null,
    });
    expect(input.a).toBe(UPPER);
  });

  it('TC-NET-052 UUID가 문자열 일부로 들어간 값(제목 등)은 바꾸지 않는다', () => {
    expect(normalizeBodyUuids({ title: `제목 ${UPPER}` })).toEqual({ title: `제목 ${UPPER}` });
  });
});

describe('stripQuery', () => {
  it('TC-NET-055 쿼리 문자열과 해시를 제거한다', () => {
    expect(stripQuery('https://s3.test/key?X-Amz-Signature=abc#frag')).toBe('https://s3.test/key');
  });
  it('쿼리가 없으면 그대로', () => {
    expect(stripQuery('https://s3.test/key')).toBe('https://s3.test/key');
  });
});

describe('pathSegment / apiPath', () => {
  it('경로 구조를 깨는 문자를 인코딩하고 UUID는 소문자로 만든다', () => {
    expect(pathSegment('a/b?c#d e')).toBe('a%2Fb%3Fc%23d%20e');
    expect(pathSegment(UPPER)).toBe(UPPER.toLowerCase());
    expect(apiPath`/posts/${UPPER}/likes`).toBe(`/posts/${UPPER.toLowerCase()}/likes`);
    expect(apiPath`/users/${'x/../y'}`).toBe('/users/x%2F..%2Fy');
    expect(apiPath`/pages/${3}`).toBe('/pages/3');
  });
});
