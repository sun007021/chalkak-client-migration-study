import { isAllowedTransportUrl } from './transportSecurity';

describe('isAllowedTransportUrl', () => {
  it.each([
    'https://api.test/x',
    'http://localhost:4010/x',
    'http://127.0.0.1/x',
    'http://10.0.2.2:4010/x',
  ])('TC-NET-051 %s 허용', (url) => expect(isAllowedTransportUrl(url)).toBe(true));

  it.each(['http://api.test/x', 'http://localhost.evil.test/x', 'ftp://x', 'nonsense'])(
    'TC-NET-051 %s 거부',
    (url) => expect(isAllowedTransportUrl(url)).toBe(false),
  );

  it.each([
    'https://api.test\\@evil.example/x', // 백슬래시
    'https://evil.example\\.api.test/x',
    'https:///api.test/x', // 슬래시 하나 더
    'https://api.test /x', // 공백
    'https://api.test\n.evil.example/x', // 제어문자
    'https://api_test/x', // 허용 문자 밖
    'https://API.test%2eevil/x',
    'https://[::1]/x',
    'http://localhost\\@evil.example/x',
    'https://./x',
  ])('거부: 모호하거나 엄격한 호스트 문법에 맞지 않는 %j', (url) =>
    expect(isAllowedTransportUrl(url)).toBe(false),
  );

  it('공용 규칙: loopback http는 유지하고 대문자 호스트·앞뒤 공백도 정규화해 판정한다', () => {
    expect(isAllowedTransportUrl('HTTP://LOCALHOST:4010/x')).toBe(true);
    expect(isAllowedTransportUrl('  https://API.test/x  ')).toBe(true);
  });
});
