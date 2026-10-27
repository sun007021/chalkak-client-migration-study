import {
  decideIssueNavigation,
  isSafeIssueUrl,
  type IssueNavigationRequest,
} from './IssueNavigationPolicy';

const PAGE = 'https://web.example.test/issues/1';

const req = (overrides: Partial<IssueNavigationRequest>): IssueNavigationRequest => ({
  url: 'https://other.example.test/x',
  isInitialLoad: false,
  isMainFrame: true,
  hasUserGesture: true,
  opensNewWindow: false,
  currentUrl: PAGE,
  ...overrides,
});

describe('isSafeIssueUrl', () => {
  it.each([
    [PAGE, true],
    ['http://web.example.test/issues/1', false],
    ['', false],
    ['https://', false],
    ['https:///path', false],
    ['not a url', false],
    ['javascript:alert(1)', false],
  ])('TC-BANR-017 %j -> %s', (url, expected) => {
    expect(isSafeIssueUrl(url)).toBe(expected);
  });
});

describe('decideIssueNavigation', () => {
  it('TC-BANR-017 최초 https 로드는 allow-in-app', () => {
    expect(
      decideIssueNavigation(
        req({ url: PAGE, isInitialLoad: true, hasUserGesture: false, currentUrl: null }),
      ),
    ).toBe('allow-in-app');
  });

  it.each(['http://web.example.test/a', '', 'https://', 'tel:0212345678'])(
    'TC-BANR-017 최초 로드가 안전하지 않은 주소(%j)면 block',
    (url) => {
      expect(decideIssueNavigation(req({ url, isInitialLoad: true, currentUrl: null }))).toBe(
        'block',
      );
    },
  );

  it('TC-BANR-018 사용자 탭 없는 자동 이동(리다이렉트·스크립트)은 block', () => {
    expect(decideIssueNavigation(req({ hasUserGesture: false }))).toBe('block');
  });

  it('TC-BANR-018 새 창 자동 열기는 block', () => {
    expect(decideIssueNavigation(req({ hasUserGesture: false, opensNewWindow: true }))).toBe(
      'block',
    );
  });

  it('TC-BANR-019 사용자가 누른 일반 링크는 open-external', () => {
    expect(decideIssueNavigation(req({}))).toBe('open-external');
  });

  it('TC-BANR-019 새 탭(target=_blank) 링크는 open-external', () => {
    expect(decideIssueNavigation(req({ opensNewWindow: true }))).toBe('open-external');
  });

  it('TC-BANR-019 같은 호스트·같은 URL 링크도 앱 안에서 이동하지 않고 open-external', () => {
    expect(decideIssueNavigation(req({ url: 'https://web.example.test/issues/2' }))).toBe(
      'open-external',
    );
    expect(decideIssueNavigation(req({ url: PAGE }))).toBe('open-external');
  });

  it('TC-BANR-019 사용자가 누른 http 링크도 open-external', () => {
    expect(decideIssueNavigation(req({ url: 'http://other.example.test/' }))).toBe('open-external');
  });

  it('TC-BANR-020 같은 문서 앵커는 allow-in-app', () => {
    expect(decideIssueNavigation(req({ url: `${PAGE}#section` }))).toBe('allow-in-app');
  });

  it('TC-BANR-020 새 탭 앵커는 open-external', () => {
    expect(decideIssueNavigation(req({ url: `${PAGE}#section`, opensNewWindow: true }))).toBe(
      'open-external',
    );
  });

  it('TC-BANR-020 다른 문서의 앵커 링크는 앵커로 보지 않는다(open-external)', () => {
    expect(decideIssueNavigation(req({ url: 'https://web.example.test/issues/2#top' }))).toBe(
      'open-external',
    );
  });

  it.each([
    'tel:0212345678',
    'mailto:a@b.test',
    'intent://scan/#Intent;scheme=zxing;end',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'chalkak://open',
    'sms:010',
  ])('TC-BANR-021 비 http(s) 스킴(%s)은 사용자가 눌러도 block', (url) => {
    expect(decideIssueNavigation(req({ url }))).toBe('block');
  });

  it('TC-BANR-022 하위 프레임 이동은 앱 밖으로 열지 않고 프레임 안에서 처리한다', () => {
    expect(
      decideIssueNavigation(
        req({ isMainFrame: false, hasUserGesture: false, url: 'https://ads.example.test/f' }),
      ),
    ).toBe('allow-in-app');
    expect(
      decideIssueNavigation(
        req({ isMainFrame: false, hasUserGesture: true, url: 'https://ads.example.test/f' }),
      ),
    ).toBe('allow-in-app');
  });
});
