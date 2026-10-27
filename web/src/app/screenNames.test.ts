import { screenNameForPath } from './routes';

describe('경로 → 분석 screen_name', () => {
  it.each([
    ['/login', 'login'],
    ['/signup/terms', 'terms'],
    ['/home', null], // 탭은 그려진 화면이 useScreenView로 보낸다
    ['/display', null],
    ['/record', null],
    ['/settings', null],
    ['/', null],
    ['/login/kakao-callback', null],
    ['/dev/session', null],
    ['/unknown', null],
  ])('REQ-BOOT-021 %s → %s', (pathname, expected) => {
    expect(screenNameForPath(pathname)).toBe(expected);
  });
});
