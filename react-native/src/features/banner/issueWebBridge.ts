import type { IssueNavigationRequest } from './IssueNavigationPolicy';

// react-native-webview의 이벤트를 IssueNavigationRequest로 바꾸는 순수 함수와 Android용 주입 스크립트.
// 어댑터(IssueWebContent)는 이 파일만 부르므로 플랫폼별 차이는 여기서 테스트한다.

export type BridgePlatform = 'ios' | 'android';

/** react-native-webview `onShouldStartLoadWithRequest`의 이벤트 중 우리가 쓰는 필드. */
export type NativeLoadRequest = {
  url: string;
  /** iOS만 의미가 있다. Android는 항상 'other'. */
  navigationType: string;
  /** Android는 하위 프레임 이동을 알려 주지 않아 항상 true. */
  isTopFrame: boolean;
};

export type RequestContext = {
  platform: BridgePlatform;
  /** 이 웹뷰 인스턴스가 첫 요청을 이미 처리했는가. */
  initialConsumed: boolean;
  /** 지금 보고 있는 문서 주소(없으면 null). */
  currentUrl: string | null;
  /** 배너 주소. */
  sourceUrl: string;
};

/**
 * 사용자 제스처 판정. WebView 네이티브 이벤트로 제스처가 오는 곳은 iOS의 navigationType뿐이다.
 * - iOS: `click`·`formsubmit`·`formresubmit`이 사용자가 한 이동이다. `other`(리다이렉트·스크립트)는 제스처가 아니다.
 * - Android: onShouldStartLoadWithRequest에는 제스처 정보가 없다(네이티브 `WebResourceRequest.hasGesture()`를 라이브러리가 버린다).
 *   그래서 Android의 사용자 링크 탭은 주입 스크립트(`createLinkScript`)가 페이지 안에서 잡아 메시지로 보내고,
 *   이 함수가 보는 네이티브 요청은 모두 제스처 없음(리다이렉트·스크립트 이동)으로 둔다.
 */
export function hasUserGesture(platform: BridgePlatform, navigationType: string): boolean {
  return (
    platform === 'ios' &&
    (navigationType === 'click' ||
      navigationType === 'formsubmit' ||
      navigationType === 'formresubmit')
  );
}

export function toNavigationRequest(
  event: NativeLoadRequest,
  context: RequestContext,
): IssueNavigationRequest {
  // Android는 programmatic loadUrl(첫 로드)에서 shouldOverrideUrlLoading이 불리지 않는다.
  // iOS는 첫 로드도 불리므로, 아직 소비하지 않은 첫 최상위 요청이 최초 로드다. 주소 비교는 하지 않는다:
  // 끝 슬래시·정규화 차이나 서버 리다이렉트로 주소가 달라도 첫 요청이다. 첫 요청이 정책에 막히면
  // ViewModel이 load-failed로 바꾼다(IssueWebViewModel.onNavigationRequest).
  const isInitialLoad = context.platform === 'ios' && !context.initialConsumed && event.isTopFrame;
  return {
    url: event.url,
    isInitialLoad,
    isMainFrame: event.isTopFrame,
    hasUserGesture: hasUserGesture(context.platform, event.navigationType),
    opensNewWindow: false,
    currentUrl: context.currentUrl,
  };
}

/** 새 창(target=_blank, window.open)은 플랫폼이 사용자 제스처 없이는 만들지 않으므로(아래 WebView 설정) 제스처가 있는 것으로 본다. */
export function toNewWindowRequest(
  targetUrl: string,
  currentUrl: string | null,
): IssueNavigationRequest {
  return {
    url: targetUrl,
    isInitialLoad: false,
    isMainFrame: true,
    hasUserGesture: true,
    opensNewWindow: true,
    currentUrl,
  };
}

export const LINK_MESSAGE_TYPE = 'chalkak.link';

/**
 * Android 전용. 사용자가 누른(isTrusted) 링크를 페이지 안에서 잡아 기본 이동을 막고 RN으로 알린다.
 * 같은 문서 앵커(#)는 기본 동작에 맡긴다. 새 탭 링크는 newWindow로 표시한다.
 * 네이티브 이벤트와 메시지의 도착 순서가 보장되지 않아 "메시지로 제스처를 알린 뒤 네이티브 요청에서 소비"하는 방식은 쓰지 않는다.
 *
 * 위조 방어: 웹뷰 마운트마다 새로 만든 nonce를 이 스크립트의 클로저에만 두고 메시지에 담는다.
 * 시작 시점에 `window.ReactNativeWebView.postMessage`를 붙잡아 두므로 페이지가 나중에 객체를 바꿔도 영향이 없다.
 * 받는 쪽(IssueWebContent)은 nonce와 보낸 문서의 origin이 맞지 않는 메시지를 버린다.
 *
 * 남는 한계: 이 스크립트는 페이지와 같은 JS 세계에서 돈다. 스크립트가 만든 합성 클릭은 isTrusted가 false라 걸러지지만,
 * 같은 문서의 스크립트가 nonce를 읽을 방법은 없어도(클로저) 사용자의 실제 탭을 가로채 링크를 바꿔치는 것까지는 막지 못한다.
 * 그래도 이 메시지로 할 수 있는 일은 정책이 허용하는 http(s) 링크를 시스템 브라우저로 여는 것뿐이다.
 *
 * 클릭 가로채기 한계: `event.target`에서 부모로 올라가며 `<a href>`를 찾는다. Shadow DOM 안의 링크는
 * 캡처 단계에서 target이 호스트 요소로 재지정되어 찾지 못하고(`composedPath()`를 쓰면 열린 shadow root는 잡힌다),
 * SVG의 `<a>`는 `href`가 문자열이 아닌 SVGAnimatedString이라 `target`/`href` 해석이 달라 잡지 못할 수 있다.
 * 잡지 못한 링크는 네이티브 요청으로 와서 제스처 없음(block)으로 처리되므로 안전한 쪽으로 실패한다.
 */
export function createLinkScript(nonce: string): string {
  return `(function () {
  var nonce = ${JSON.stringify(nonce)};
  var bridge = window.ReactNativeWebView;
  var post = bridge && bridge.postMessage;
  if (!post) return;
  var stripHash = function (u) { var i = u.indexOf('#'); return i < 0 ? u : u.slice(0, i); };
  document.addEventListener('click', function (event) {
    if (!event.isTrusted) return;
    var node = event.target;
    while (node && !(typeof node.tagName === 'string' && node.tagName.toUpperCase() === 'A' && node.href)) node = node.parentElement;
    if (!node) return;
    var href = String(node.href);
    var newWindow = node.target === '_blank';
    var sameDocAnchor = href.indexOf('#') >= 0 && stripHash(href) === stripHash(location.href);
    if (sameDocAnchor && !newWindow) return;
    event.preventDefault();
    event.stopPropagation();
    post.call(bridge, JSON.stringify({ type: '${LINK_MESSAGE_TYPE}', nonce: nonce, url: href, newWindow: newWindow }));
  }, true);
})(); true;`;
}

export type LinkMessage = { url: string; newWindow: boolean };

/** 주입 스크립트가 보낸 메시지. 모양이나 nonce가 다르면 null(페이지가 임의로 보낸 메시지는 무시한다). */
export function parseLinkMessage(data: string, nonce: string): LinkMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { type, url, newWindow, nonce: received } = parsed as Record<string, unknown>;
  if (type !== LINK_MESSAGE_TYPE || typeof url !== 'string' || received !== nonce) return null;
  return { url, newWindow: newWindow === true };
}

/** 링크 메시지를 정책 입력으로. 사용자가 누른 실제 클릭이므로 제스처 있음. */
export function linkMessageToRequest(
  message: LinkMessage,
  currentUrl: string | null,
): IssueNavigationRequest {
  return {
    url: message.url,
    isInitialLoad: false,
    isMainFrame: true,
    hasUserGesture: true,
    opensNewWindow: message.newWindow,
    currentUrl,
  };
}

const ORIGIN = /^(https?):\/\/([^\s/?#]+)/i;

/** http(s) 주소의 origin(스킴+호스트+포트, 소문자). 둘 중 하나라도 http(s)가 아니면 같은 origin이 아니다. */
export function isSameOrigin(a: string, b: string): boolean {
  const left = ORIGIN.exec(a);
  const right = ORIGIN.exec(b);
  if (!left || !right) return false;
  return (
    left[1].toLowerCase() === right[1].toLowerCase() &&
    left[2].toLowerCase() === right[2].toLowerCase()
  );
}
