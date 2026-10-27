import type { IssueNavigationRequest } from './IssueNavigationPolicy';

// react-native-webview의 이벤트를 IssueNavigationRequest로 바꾸는 순수 함수와 Android용 주입 스크립트.
// 어댑터(IssueWebContent)는 이 파일만 부르므로 플랫폼별 차이는 여기서 테스트한다.

export type Platform = 'ios' | 'android';

/** react-native-webview `onShouldStartLoadWithRequest`의 이벤트 중 우리가 쓰는 필드. */
export type NativeLoadRequest = {
  url: string;
  /** iOS만 의미가 있다. Android는 항상 'other'. */
  navigationType: string;
  /** Android는 하위 프레임 이동을 알려 주지 않아 항상 true. */
  isTopFrame: boolean;
};

export type RequestContext = {
  platform: Platform;
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
 *   그래서 Android의 사용자 링크 탭은 주입 스크립트(`ANDROID_LINK_SCRIPT`)가 페이지 안에서 잡아 메시지로 보내고,
 *   이 함수가 보는 네이티브 요청은 모두 제스처 없음(리다이렉트·스크립트 이동)으로 둔다.
 */
export function hasUserGesture(platform: Platform, navigationType: string): boolean {
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
  // iOS는 첫 로드도 불리므로, 아직 첫 요청을 처리하지 않았고 배너 주소와 같을 때만 최초 로드로 본다.
  const isInitialLoad =
    context.platform === 'ios' &&
    !context.initialConsumed &&
    event.isTopFrame &&
    event.url === context.sourceUrl;
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
 */
export const ANDROID_LINK_SCRIPT = `(function () {
  if (window.__chalkakLinkBridge) return;
  window.__chalkakLinkBridge = true;
  var stripHash = function (u) { var i = u.indexOf('#'); return i < 0 ? u : u.slice(0, i); };
  document.addEventListener('click', function (event) {
    if (!event.isTrusted) return;
    var node = event.target;
    while (node && !(node.tagName === 'A' && node.href)) node = node.parentElement;
    if (!node) return;
    var newWindow = node.target === '_blank';
    var sameDocAnchor = node.href.indexOf('#') >= 0 && stripHash(node.href) === stripHash(location.href);
    if (sameDocAnchor && !newWindow) return;
    event.preventDefault();
    event.stopPropagation();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: '${LINK_MESSAGE_TYPE}', url: node.href, newWindow: newWindow }));
  }, true);
})(); true;`;

export type LinkMessage = { url: string; newWindow: boolean };

/** 주입 스크립트가 보낸 메시지. 모양이 다르면 null(페이지가 임의로 보낸 메시지는 무시한다). */
export function parseLinkMessage(data: string): LinkMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { type, url, newWindow } = parsed as Record<string, unknown>;
  if (type !== LINK_MESSAGE_TYPE || typeof url !== 'string') return null;
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
