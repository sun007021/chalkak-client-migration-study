import { isHttpsUrlWithHost } from '../../data/decode';

export type IssueNavigationRequest = {
  /** 이동하려는 주소. */
  url: string;
  /** 웹뷰의 첫 로드(배너 주소)인가. */
  isInitialLoad: boolean;
  /** false면 하위 프레임(iframe) 이동. */
  isMainFrame: boolean;
  /** 사용자 탭으로 시작됐는가(리다이렉트·스크립트 이동은 false). */
  hasUserGesture: boolean;
  /** 새 창/새 탭으로 열려는 링크(target=_blank, window.open). */
  opensNewWindow: boolean;
  /** 지금 보고 있는 문서 주소(앵커 판정용). 첫 로드는 null. */
  currentUrl: string | null;
};

/** allow-in-app: 웹뷰 안에서 처리 / open-external: 시스템 브라우저로 / block: 아무것도 하지 않음. */
export type IssueNavigationDecision = 'allow-in-app' | 'open-external' | 'block';

/**
 * 배너 웹뷰 링크 정책(순수 함수, TC-BANR-017~022). 다섯 플랫폼이 같은 입력 표로 검증한다.
 * - 첫 로드: https이고 호스트가 있으면 allow-in-app, 아니면 block.
 * - 그 밖: http(s)가 아닌 스킴은 하위 프레임이든 최상위든 block.
 * - 하위 프레임의 http(s) 이동: allow-in-app.
 * - 첫 로드 이후 최상위: 사용자 제스처 없는 이동·새 창은 block,
 *   같은 문서 앵커(#)는 allow-in-app(새 창 앵커는 open-external), 나머지 http(s) 링크는 open-external.
 */
export function decideIssueNavigation(request: IssueNavigationRequest): IssueNavigationDecision {
  if (request.isInitialLoad) return isSafeIssueUrl(request.url) ? 'allow-in-app' : 'block';
  // 비 http(s) 스킴(tel:, intent: 등)은 하위 프레임에서도 막는다(REQ-BANR-017). iframe 안의 앱 실행 시도를 차단한다.
  if (!isWebUrl(request.url)) return 'block';
  if (!request.isMainFrame) return 'allow-in-app';
  if (!request.hasUserGesture) return 'block';
  if (!request.opensNewWindow && isSameDocumentAnchor(request.url, request.currentUrl)) {
    return 'allow-in-app';
  }
  return 'open-external';
}

const WEB_URL = /^https?:\/\/[^\s/?#]+/i;
const isWebUrl = (url: string): boolean => WEB_URL.test(url);

const withoutFragment = (url: string): string => {
  const index = url.indexOf('#');
  return index < 0 ? url : url.slice(0, index);
};

/** 현재 문서와 `#` 앞이 같고 `#`가 있는 주소만 같은 문서 앵커다(`#` 없는 같은 주소는 새 이동이다). */
function isSameDocumentAnchor(url: string, currentUrl: string | null): boolean {
  if (currentUrl === null || !url.includes('#')) return false;
  return withoutFragment(url) === withoutFragment(currentUrl);
}

/** 배너 webViewUrl을 첫 로드해도 되는가: https이고 호스트가 있다(REQ-BANR-013). */
export function isSafeIssueUrl(url: string): boolean {
  return isHttpsUrlWithHost(url);
}
