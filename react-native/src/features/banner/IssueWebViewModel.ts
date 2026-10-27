import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener, ExternalLinkResult } from '../../core/linking/ExternalLinkOpener';
import { Observable } from '../../core/state/Observable';
import { t } from '../../shared/copy';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import {
  decideIssueNavigation,
  isSafeIssueUrl,
  type IssueNavigationDecision,
  type IssueNavigationRequest,
} from './IssueNavigationPolicy';

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
  private screenShown = false;
  private released = false;

  constructor(private readonly deps: IssueWebDeps) {
    super(initialState(deps.url));
  }

  /** 화면이 보일 때 `screen_view issue`를 보낸다. 여러 번 불려도 한 번만(D-22, REQ-BANR-012). */
  onScreenShown(): void {
    if (this.released || this.screenShown) return;
    this.screenShown = true;
    this.deps.analytics.screenView('issue');
  }

  /** 페이지 로드 완료: loading -> ready (오류 상태는 유지). */
  onLoadEnd(): void {
    if (this.released) return;
    this.setState((s) => (s.phase === 'loading' ? { ...s, phase: 'ready' } : s));
  }

  /** 로드 실패(네트워크·HTTP 오류): error(load-failed). 주소가 안전하지 않아 로드하지 않은 상태는 바꾸지 않는다. */
  onLoadError(): void {
    if (this.released) return;
    this.setState((s) =>
      s.sourceUrl === null ? s : { ...s, phase: 'error', errorKind: 'load-failed' },
    );
  }

  /** 다시 시도: 안전한 주소면 loading으로 돌아가고 loadAttempt를 올린다. 안전하지 않은 주소는 계속 link-unavailable. */
  retry(): void {
    this.setState((s) =>
      s.sourceUrl === null
        ? s
        : { ...s, phase: 'loading', errorKind: null, loadAttempt: s.loadAttempt + 1 },
    );
  }

  /**
   * 웹뷰의 이동 요청 판정. 정책(decideIssueNavigation)에 따르고, open-external이면 시스템 브라우저를 열되
   * 결과가 no-browser면 토스트 banner.no-browser, failed면 banner.open-failed를 보인다. 동기로 판정을 돌려준다.
   *
   * 로드 중(loading) 최상위 문서의 사용자 제스처 없는 이동(최초 로드·리다이렉트)이 막히면 웹뷰는 이 요청을 거부해
   * 문서를 받지 못하고 로드 완료도 오지 않는다. 스피너가 끝없이 돌지 않도록 load-failed로 바꾼다(다시 시도 가능).
   * 사용자가 누른 링크, 하위 프레임, 새 창의 차단은 현재 문서가 정상이므로 상태를 바꾸지 않는다.
   */
  onNavigationRequest(request: IssueNavigationRequest): IssueNavigationDecision {
    const decision = decideIssueNavigation(request);
    if (decision === 'open-external') void this.openExternal(request.url);
    else if (
      decision === 'block' &&
      request.isMainFrame &&
      !request.hasUserGesture &&
      !request.opensNewWindow
    ) {
      this.onLoadBlocked();
    }
    return decision;
  }

  /** 화면(라우트)이 사라질 때 부른다. 이후 늦게 끝난 외부 열기 결과가 토스트로 나오지 않게 한다. */
  override dispose(): void {
    this.released = true;
    super.dispose();
  }

  private onLoadBlocked(): void {
    if (this.released) return;
    this.setState((s) =>
      s.sourceUrl !== null && s.phase === 'loading'
        ? { ...s, phase: 'error', errorKind: 'load-failed' }
        : s,
    );
  }

  private async openExternal(url: string): Promise<void> {
    let result: ExternalLinkResult;
    try {
      result = await this.deps.linkOpener.open(url);
    } catch {
      result = 'failed';
    }
    if (this.released) return;
    if (result === 'no-browser') this.deps.toast.show(t('banner.no-browser'));
    else if (result === 'failed') this.deps.toast.show(t('banner.open-failed'));
  }
}

function initialState(url: string): IssueWebState {
  return isSafeIssueUrl(url)
    ? { sourceUrl: url, phase: 'loading', errorKind: null, loadAttempt: 0 }
    : { sourceUrl: null, phase: 'error', errorKind: 'link-unavailable', loadAttempt: 0 };
}
