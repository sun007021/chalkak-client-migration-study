import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener } from '../../core/link/ExternalLinkOpener';
import { Observable } from '../../core/state/Observable';
import { decideDocumentTarget } from './TermsDocumentPolicy';
import type { TermsKind } from './TermsViewModel';

export type TermsDocumentState = {
  /** loading: 웹뷰 로드 중 / loaded / error: 로드 실패("다시 시도") / cannot-open: 열 수 없는 URL */
  status: 'loading' | 'loaded' | 'error' | 'cannot-open';
  /** 웹뷰가 불러올 URL. 앱 안에서 열지 않는 경우 null. */
  inAppUrl: string | null;
  /** 다시 시도할 때마다 증가(웹뷰 key로 써서 재로딩한다). */
  loadAttempt: number;
};

export type TermsDocumentDeps = {
  kind: TermsKind;
  url: string;
  analytics: AnalyticsTracker;
  externalLinkOpener: ExternalLinkOpener;
};

/** 약관 문서 시트. 설정에서도 같은 클래스를 쓴다. 웹뷰 컴포넌트는 플랫폼 부분이라 화면이 주입받는다. */
export class TermsDocumentViewModel extends Observable<TermsDocumentState> {
  constructor(private readonly deps: TermsDocumentDeps) {
    super({ status: 'loading', inAppUrl: null, loadAttempt: 0 });
  }

  get kind(): TermsKind {
    return this.deps.kind;
  }

  /**
   * 소유자가 만든 직후 한 번 부른다: screen_view(terms_of_service | privacy_policy)를 보내고 열 곳을 정한다.
   * in-app이면 inAppUrl 설정, external이면 외부 브라우저로 열고 실패하면 cannot-open, reject면 cannot-open.
   * 외부 브라우저로 열렸으면 status는 loaded이고 inAppUrl은 null이다(소유자가 시트를 닫는다).
   */
  async start(): Promise<void> {
    const { kind, url, analytics, externalLinkOpener } = this.deps;
    analytics.screenView(kind === 'service' ? 'terms_of_service' : 'privacy_policy');
    const target = decideDocumentTarget(url);
    if (target === 'in-app') {
      this.setState({ ...this.getSnapshot(), status: 'loading', inAppUrl: url });
      return;
    }
    const opened = target === 'external' && (await openSafely(externalLinkOpener, url));
    this.setState({ ...this.getSnapshot(), status: opened ? 'loaded' : 'cannot-open' });
  }

  onWebViewLoaded(): void {
    if (this.getSnapshot().status === 'loading')
      this.setState({ ...this.getSnapshot(), status: 'loaded' });
  }

  onWebViewFailed(): void {
    if (this.getSnapshot().status === 'loading')
      this.setState({ ...this.getSnapshot(), status: 'error' });
  }

  /** 오류 상태에서만 동작한다. */
  retry(): void {
    const state = this.getSnapshot();
    if (state.status !== 'error') return;
    this.setState({ ...state, status: 'loading', loadAttempt: state.loadAttempt + 1 });
  }
}

async function openSafely(opener: ExternalLinkOpener, url: string): Promise<boolean> {
  try {
    return await opener.open(url);
  } catch {
    return false;
  }
}
