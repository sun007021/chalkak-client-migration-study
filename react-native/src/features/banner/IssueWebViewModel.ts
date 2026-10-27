import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener } from '../../core/linking/ExternalLinkOpener';
import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { IssueNavigationDecision, IssueNavigationRequest } from './IssueNavigationPolicy';

export type IssueWebErrorKind = 'link-unavailable' | 'load-failed';

export type IssueWebState = {
  /** 웹뷰가 로드할 주소. 안전하지 않은 주소면 null(로드하지 않는다). */
  sourceUrl: string | null;
  phase: 'loading' | 'ready' | 'error';
  errorKind: IssueWebErrorKind | null;
  /** 다시 시도마다 1씩 늘어난다. 화면이 이 값을 키로 같은 주소를 다시 로드한다. */
  loadAttempt: number;
};

export type IssueWebDeps = {
  /** 배너의 webViewUrl. */
  url: string;
  analytics: AnalyticsTracker;
  toast: ToastPresenter;
  linkOpener: ExternalLinkOpener;
};

export class IssueWebViewModel extends Observable<IssueWebState> {
  constructor(private readonly deps: IssueWebDeps) {
    super({ sourceUrl: null, phase: 'loading', errorKind: null, loadAttempt: 0 });
  }

  /** 화면이 보일 때 `screen_view issue`를 보낸다. 여러 번 불려도 한 번만(D-22, REQ-BANR-012). */
  onScreenShown(): void {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 페이지 로드 완료: loading -> ready (오류 상태는 유지). */
  onLoadEnd(): void {
    throw new Error('not implemented');
  }

  /** 로드 실패(네트워크·HTTP 오류): error(load-failed). */
  onLoadError(): void {
    throw new Error('not implemented');
  }

  /** 다시 시도: 안전한 주소면 loading으로 돌아가고 loadAttempt를 올린다. 안전하지 않은 주소는 계속 link-unavailable. */
  retry(): void {
    throw new Error('not implemented');
  }

  /**
   * 웹뷰의 이동 요청 판정. 정책(decideIssueNavigation)에 따르고, open-external이면 시스템 브라우저를 열되
   * 결과가 no-browser면 토스트 banner.no-browser, failed면 banner.open-failed를 보인다. 동기로 판정을 돌려준다.
   */
  onNavigationRequest(_request: IssueNavigationRequest): IssueNavigationDecision {
    throw new Error('not implemented');
  }
}
