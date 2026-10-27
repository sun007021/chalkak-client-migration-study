import { decideIssueNavigation } from './IssueNavigationPolicy';
import {
  ANDROID_LINK_SCRIPT,
  hasUserGesture,
  linkMessageToRequest,
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

describe('새 창과 Android 링크 메시지', () => {
  it('새 창 요청은 제스처 있음 + 새 창이라 외부 브라우저', () => {
    expect(decideIssueNavigation(toNewWindowRequest('https://elsewhere.test/', SOURCE))).toBe(
      'open-external',
    );
  });

  it('링크 메시지를 파싱하고 정책으로 외부 열기를 판정한다', () => {
    const message = parseLinkMessage(
      JSON.stringify({ type: 'chalkak.link', url: 'https://elsewhere.test/', newWindow: false }),
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
    [JSON.stringify({ type: 'other', url: 'https://x.test/' })],
    [JSON.stringify({ type: 'chalkak.link', url: 5 })],
    [JSON.stringify(null)],
  ])('형식이 다른 메시지(%s)는 무시한다', (data) => {
    expect(parseLinkMessage(data)).toBeNull();
  });

  it('주입 스크립트는 문법이 올바른 즉시 실행 함수이고 메시지 타입을 쓴다', () => {
    expect(() => new Function(ANDROID_LINK_SCRIPT)).not.toThrow();
    expect(ANDROID_LINK_SCRIPT).toContain('chalkak.link');
  });
});
