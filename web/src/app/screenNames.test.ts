import { screenNameForPath } from './routes';

describe('경로 → 분석 screen_name', () => {
  it.each([
    ['/login', 'login'],
    ['/signup/terms', 'terms'],
    ['/home', 'home'],
    ['/', null],
    ['/login/kakao-callback', null],
    ['/dev/session', null],
    ['/unknown', null],
  ])('REQ-BOOT-021 %s → %s', (pathname, expected) => {
    expect(screenNameForPath(pathname)).toBe(expected);
  });
});
