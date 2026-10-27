import { normalizeApiBaseUrl, readAppConfig } from './AppConfig';

const DEV = 'https://chalkak-dev.pysun.kr';

describe('readAppConfig', () => {
  it('TC-NET-058 extra의 서버 origin에 /api/v1/을 붙여 돌려준다(개발 서버 폴백 없음)', () => {
    expect(readAppConfig({ apiBaseUrl: 'http://localhost:4010' })).toEqual({
      ok: true,
      config: { apiBaseUrl: 'http://localhost:4010/api/v1/' },
    });
  });

  it.each([
    ['extra 없음', undefined],
    ['extra null', null],
    ['키 없음', {}],
    ['undefined', { apiBaseUrl: undefined }],
    ['빈 문자열', { apiBaseUrl: '' }],
    ['공백', { apiBaseUrl: '   ' }],
    ['문자열 아님', { apiBaseUrl: 42 }],
    ['http 외부 호스트', { apiBaseUrl: 'http://chalkak-dev.pysun.kr' }],
  ])('TC-NET-050 %s이면 설정 오류이고 기본값으로 대체하지 않는다', (_label, extra) => {
    expect(readAppConfig(extra)).toEqual({ ok: false, error: 'config' });
  });
});

describe('normalizeApiBaseUrl', () => {
  it.each([
    [DEV, `${DEV}/api/v1/`],
    [`${DEV}/`, `${DEV}/api/v1/`],
    [`${DEV}/api/v1`, `${DEV}/api/v1/`],
    [`${DEV}/api/v1/`, `${DEV}/api/v1/`],
    [`${DEV}//`, `${DEV}/api/v1/`],
    [`  ${DEV}  `, `${DEV}/api/v1/`],
    ['HTTPS://Chalkak-Dev.Pysun.KR', `${DEV}/api/v1/`],
    ['https://example.com:8443', 'https://example.com:8443/api/v1/'],
  ])('TC-NET-050 %j -> %j (/api/v1 중복 없음)', (input, expected) => {
    expect(normalizeApiBaseUrl(input)).toBe(expected);
  });

  it.each([
    'http://localhost:4010',
    'http://127.0.0.1:4010/',
    'http://10.0.2.2:4010/api/v1',
    'http://LOCALHOST',
  ])('TC-NET-050 E2E mock용 loopback 호스트의 http %j는 허용한다', (input) => {
    expect(normalizeApiBaseUrl(input)).toMatch(/^http:\/\/[a-z0-9.]+(:4010)?\/api\/v1\/$/);
  });

  it.each([
    'http://chalkak-dev.pysun.kr',
    'http://192.168.0.5:4010',
    'http://localhost.evil.com',
    'ftp://chalkak-dev.pysun.kr',
    'chalkak-dev.pysun.kr',
    '//chalkak-dev.pysun.kr',
    'https://',
    `${DEV}/other`,
    `${DEV}/api/v1/extra`,
    `${DEV}/api/v2`,
    `${DEV}?x=1`,
    `${DEV}#frag`,
    'https://user:pw@chalkak-dev.pysun.kr',
  ])('TC-NET-050 %j는 구성 오류(null)', (input) => {
    expect(normalizeApiBaseUrl(input)).toBeNull();
  });
});
