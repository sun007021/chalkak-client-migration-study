import { decideIssueNavigation } from './IssueNavigationPolicy';
import {
  createLinkScript,
  hasUserGesture,
  isSameOrigin,
  linkMessageToRequest,
  LINK_MESSAGE_TYPE,
  parseLinkMessage,
  toNavigationRequest,
  toNewWindowRequest,
  type RequestContext,
} from './issueWebBridge';

const SOURCE = 'https://web.example.test/issues/1';
const ios: RequestContext = {
  platform: 'ios',
  initialConsumed: false,
  currentUrl: null,
  sourceUrl: SOURCE,
};
const android: RequestContext = { ...ios, platform: 'android', initialConsumed: true };
const native = (url: string, navigationType = 'other', isTopFrame = true) => ({
  url,
  navigationType,
  isTopFrame,
});

describe('hasUserGesture', () => {
  it.each([
    ['ios', 'click', true],
    ['ios', 'formsubmit', true],
    ['ios', 'other', false],
    ['ios', 'backforward', false],
    ['android', 'click', false],
    ['android', 'other', false],
  ] as const)('%s %s -> %s', (platform, type, expected) => {
    expect(hasUserGesture(platform, type)).toBe(expected);
  });
});

describe('toNavigationRequest', () => {
  it('iOS 첫 요청이 배너 주소면 최초 로드이고 정책이 앱 안 허용으로 본다', () => {
    const request = toNavigationRequest(native(SOURCE), ios);
    expect(request.isInitialLoad).toBe(true);
    expect(decideIssueNavigation(request)).toBe('allow-in-app');
  });

  it('iOS 첫 요청을 처리한 뒤 같은 주소는 최초 로드가 아니다', () => {
    const request = toNavigationRequest(native(SOURCE, 'click'), { ...ios, initialConsumed: true });
    expect(request.isInitialLoad).toBe(false);
    expect(decideIssueNavigation(request)).toBe('open-external');
  });

  it.each([
    ['끝 슬래시가 붙은 주소', `${SOURCE}/`],
    ['쿼리가 붙은 주소', `${SOURCE}?utm=1`],
    ['서버가 먼저 리다이렉트한 주소', 'https://web.example.test/landing'],
  ])('iOS 첫 최상위 요청은 주소가 달라도(%s) 최초 로드다', (_name, url) => {
    const request = toNavigationRequest(native(url), ios);
    expect(request.isInitialLoad).toBe(true);
  });

  it('iOS 하위 프레임 요청은 최초 로드가 아니다', () => {
    expect(toNavigationRequest(native(SOURCE, 'other', false), ios).isInitialLoad).toBe(false);
  });

  it('Android는 최초 로드가 이벤트로 오지 않으므로 같은 주소여도 최초 로드로 보지 않는다', () => {
    expect(toNavigationRequest(native(SOURCE), android).isInitialLoad).toBe(false);
  });

  it('리다이렉트·스크립트 이동(other)은 제스처 없음이라 block', () => {
    const request = toNavigationRequest(native('https://elsewhere.test/', 'other'), {
      ...ios,
      initialConsumed: true,
      currentUrl: SOURCE,
    });
    expect(decideIssueNavigation(request)).toBe('block');
  });

  it('iOS 사용자 탭(click)은 외부 브라우저', () => {
    const request = toNavigationRequest(native('https://elsewhere.test/', 'click'), {
      ...ios,
      initialConsumed: true,
      currentUrl: SOURCE,
    });
    expect(decideIssueNavigation(request)).toBe('open-external');
  });

  it('하위 프레임은 앱 안 허용', () => {
    const request = toNavigationRequest(native('https://ads.test/f', 'other', false), {
      ...ios,
      initialConsumed: true,
    });
    expect(request.isMainFrame).toBe(false);
    expect(decideIssueNavigation(request)).toBe('allow-in-app');
  });
});

const NONCE = 'n0nce-abc';

describe('새 창과 Android 링크 메시지', () => {
  it('새 창 요청은 제스처 있음 + 새 창이라 외부 브라우저', () => {
    expect(decideIssueNavigation(toNewWindowRequest('https://elsewhere.test/', SOURCE))).toBe(
      'open-external',
    );
  });

  it('링크 메시지를 파싱하고 정책으로 외부 열기를 판정한다', () => {
    const message = parseLinkMessage(
      JSON.stringify({
        type: 'chalkak.link',
        nonce: NONCE,
        url: 'https://elsewhere.test/',
        newWindow: false,
      }),
      NONCE,
    );
    expect(message).toEqual({ url: 'https://elsewhere.test/', newWindow: false });
    expect(decideIssueNavigation(linkMessageToRequest(message!, SOURCE))).toBe('open-external');
  });

  it('http(s)가 아닌 스킴의 링크 메시지는 block', () => {
    const message = { url: 'intent://scan/#Intent;end', newWindow: false };
    expect(decideIssueNavigation(linkMessageToRequest(message, SOURCE))).toBe('block');
  });

  it.each([
    ['not json'],
    [JSON.stringify({ type: 'other', nonce: NONCE, url: 'https://x.test/' })],
    [JSON.stringify({ type: 'chalkak.link', nonce: NONCE, url: 5 })],
    [JSON.stringify(null)],
  ])('형식이 다른 메시지(%s)는 무시한다', (data) => {
    expect(parseLinkMessage(data, NONCE)).toBeNull();
  });

  it.each([
    ['nonce 없음', { type: 'chalkak.link', url: 'https://x.test/' }],
    ['nonce 불일치', { type: 'chalkak.link', nonce: 'guess', url: 'https://x.test/' }],
  ])('%s인 메시지는 페이지가 위조한 것으로 보고 버린다', (_name, body) => {
    expect(parseLinkMessage(JSON.stringify(body), NONCE)).toBeNull();
  });
});

describe('isSameOrigin', () => {
  it.each([
    ['https://a.test/x', 'https://a.test/y?q=1#h', true],
    ['https://A.test/x', 'https://a.test/', true],
    ['https://a.test/x', 'http://a.test/x', false],
    ['https://a.test/x', 'https://b.test/x', false],
    ['https://a.test:8443/x', 'https://a.test/x', false],
    ['about:blank', 'https://a.test/', false],
    ['', 'https://a.test/', false],
  ])('%s vs %s -> %s', (a, b, expected) => {
    expect(isSameOrigin(a, b)).toBe(expected);
  });
});

describe('createLinkScript(주입 스크립트 동작)', () => {
  type Listener = (event: unknown) => void;
  function run(options: { href?: string } = {}) {
    const posted: string[] = [];
    const listeners: Listener[] = [];
    const bridge = { postMessage: (data: string) => posted.push(data) };
    const win = { ReactNativeWebView: bridge };
    const doc = {
      addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
    };
    const location = { href: options.href ?? 'https://web.example.test/issues/1' };
    new Function('window', 'document', 'location', createLinkScript(NONCE))(win, doc, location);
    const click = (anchor: Record<string, unknown>, trusted = true) => {
      const event = {
        isTrusted: trusted,
        target: { ...anchor, parentElement: null },
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
        stopPropagation() {},
      };
      listeners.forEach((listener) => listener(event));
      return event;
    };
    return { posted, win, bridge, click };
  }

  it('문법이 올바르고 메시지 타입과 nonce를 담아 보낸다', () => {
    const h = run();
    const event = h.click({ tagName: 'A', href: 'https://elsewhere.test/', target: '' });
    expect(event.prevented).toBe(true);
    expect(JSON.parse(h.posted[0])).toEqual({
      type: LINK_MESSAGE_TYPE,
      nonce: NONCE,
      url: 'https://elsewhere.test/',
      newWindow: false,
    });
  });

  it('tagName을 대소문자 구분 없이 비교한다(SVG의 a는 소문자)', () => {
    const h = run();
    h.click({ tagName: 'a', href: 'https://elsewhere.test/', target: '_blank' });
    expect(JSON.parse(h.posted[0])).toMatchObject({ newWindow: true });
  });

  it('신뢰되지 않은 클릭(스크립트가 만든 이벤트)은 무시한다', () => {
    const h = run();
    h.click({ tagName: 'A', href: 'https://elsewhere.test/', target: '' }, false);
    expect(h.posted).toEqual([]);
  });

  it('같은 문서 앵커는 기본 동작에 맡긴다', () => {
    const h = run();
    const event = h.click({
      tagName: 'A',
      href: 'https://web.example.test/issues/1#top',
      target: '',
    });
    expect(event.prevented).toBe(false);
    expect(h.posted).toEqual([]);
  });

  it('시작 시점의 postMessage를 붙잡아 두므로 페이지가 나중에 바꿔도 영향이 없다', () => {
    const h = run();
    const hijacked: string[] = [];
    h.win.ReactNativeWebView = { postMessage: (data: string) => hijacked.push(data) };
    h.click({ tagName: 'A', href: 'https://elsewhere.test/', target: '' });
    expect(h.posted).toHaveLength(1);
    expect(hijacked).toEqual([]);
  });
});
