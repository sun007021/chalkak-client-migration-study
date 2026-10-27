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
});
