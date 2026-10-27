import { ConfigError } from './ApiError';
import { parseApiBaseUrl } from './ApiBaseUrl';

describe('parseApiBaseUrl', () => {
  it('TC-NET-050 https 주소는 끝에 슬래시를 보장해 돌려준다', () => {
    expect(parseApiBaseUrl('https://mock.test/api/v1')).toBe('https://mock.test/api/v1/');
    expect(parseApiBaseUrl('https://mock.test/api/v1/')).toBe('https://mock.test/api/v1/');
  });

  it.each([
    ['http 주소', 'http://localhost:4010/api/v1/'],
    ['빈 문자열', ''],
    ['공백', '   '],
    ['스킴 없음', 'chalkak-dev.pysun.kr/api/v1/'],
    ['지원하지 않는 스킴', 'ftp://example.com/'],
    ['URL 아님', 'not a url'],
  ])('TC-NET-050 REQ-NET-002 %s는 ConfigError', (_n, value) => {
    expect(() => parseApiBaseUrl(value)).toThrow(ConfigError);
  });

  it.each([undefined, null])(
    'TC-NET-058 REQ-NET-002 값이 %s이면 개발 서버로 폴백하지 않고 ConfigError',
    (value) => {
      expect(() => parseApiBaseUrl(value)).toThrow(ConfigError);
    },
  );
});
