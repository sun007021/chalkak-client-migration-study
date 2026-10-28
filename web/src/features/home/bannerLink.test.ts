import { isOpenableBannerUrl } from './bannerLink';

describe('isOpenableBannerUrl (Web은 새 탭, https만: REQ-BANR-013, 017)', () => {
  it('TC-BANR-017 https 주소는 연다', () => {
    expect(isOpenableBannerUrl('https://web.example.test/issues/1')).toBe(true);
    expect(isOpenableBannerUrl('https://web.example.test/issues/1?utm=a#top')).toBe(true);
    expect(isOpenableBannerUrl('HTTPS://web.example.test/issues/1')).toBe(true); // 스킴은 대소문자를 구분하지 않는다
    expect(isOpenableBannerUrl('https://web.example.test:8443/a@b')).toBe(true); // 경로의 @는 userinfo가 아니다
  });

  it.each([
    ['http', 'http://web.example.test/issues/1'],
    ['빈 문자열', ''],
    ['공백', '   '],
    ['호스트 없음', 'https://'],
    ['호스트 없음(경로만)', 'https:///issues/1'],
    ['스킴 없음', 'web.example.test/issues/1'],
    ['상대 경로', '/issues/1'],
    ['tel', 'tel:0212345678'],
    ['mailto', 'mailto:a@example.test'],
    ['intent', 'intent://scan/#Intent;scheme=zxing;end'],
    ['javascript', 'javascript:alert(1)'],
    ['file', 'file:///etc/passwd'],
    ['data', 'data:text/html,<b>x</b>'],
    ['커스텀 스킴', 'chalkak://home'],
    ['대문자 HTTP', 'HTTP://web.example.test'],
    ['앞 공백', ' https://web.example.test/issues/1'],
    ['줄바꿈 포함', 'https://web.example.test/\nissues/1'],
    ['탭 포함', 'https://web.exa\tmple.test'],
    ['userinfo', 'https://user:pass@web.example.test/issues/1'],
    ['userinfo(이름만)', 'https://user@web.example.test/'],
  ])('TC-BANR-017 TC-BANR-021 %s은 열지 않는다', (_name, url) => {
    expect(isOpenableBannerUrl(url)).toBe(false);
  });
});
