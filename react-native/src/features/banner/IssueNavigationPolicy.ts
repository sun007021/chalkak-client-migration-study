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
 * - 하위 프레임: allow-in-app.
 * - 그 밖(첫 로드 이후 최상위): http(s)가 아닌 스킴은 block, 사용자 제스처 없는 이동·새 창은 block,
 *   같은 문서 앵커(#)는 allow-in-app(새 창 앵커는 open-external), 나머지 http(s) 링크는 open-external.
 */
export function decideIssueNavigation(_request: IssueNavigationRequest): IssueNavigationDecision {
  throw new Error('not implemented');
}

/** 배너 webViewUrl을 첫 로드해도 되는가: https이고 호스트가 있다(REQ-BANR-013). */
export function isSafeIssueUrl(_url: string): boolean {
  throw new Error('not implemented');
}
