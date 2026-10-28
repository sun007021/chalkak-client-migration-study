import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener } from '../../core/linking/ExternalLinkOpener';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import { Observable } from '../../core/state/Observable';
import { TERMS_URLS } from '../../shared/constants';
import type { PendingSignUp } from '../../data/auth/AuthRepository';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { SignatureFlowViewModel } from '../signature/SignatureFlowViewModel';
import { TermsDocumentViewModel } from './TermsDocumentViewModel';
import { TermsViewModel, type TermsKind } from './TermsViewModel';

export type SignUpFlowState = {
  step: 'terms' | 'signature';
  /** 열려 있는 약관 문서 시트(없으면 null). */
  openDocument: TermsKind | null;
};

export type SignUpFlowDeps = {
  /** 이 가입 시도의 컨텍스트(메모리에만). 흐름이 끝나거나 버려지면 함께 사라진다. */
  pending: PendingSignUp;
  analytics: AnalyticsTracker;
  authNavigator: AuthFlowNavigator;
  pushRegistrar: PushRegistrar;
  linkOpener: ExternalLinkOpener;
  /** 사인 흐름(onboarding 모드)을 만든다. 콜백은 이 클래스가 넘긴다. */
  createSignatureFlow: (host: {
    onCompleted: () => void;
    onExit: () => void;
  }) => SignatureFlowViewModel;
};

/**
 * 가입 흐름(약관 -> 사인 그리기 -> 미리보기)의 소유자 ViewModel. 하위 ViewModel(약관, 문서, 사인 흐름)은 여기서 만들고 버린다.
 * 뒤로: 문서 -> 닫기, 사인 그리기 -> 약관(사인 흐름 버림), 미리보기 -> 그리기, 약관 -> 로그인(toLogin).
 * 가입 완료: 푸시 기기 등록을 시작하고 메인(member)으로 보낸다.
 */
export class SignUpFlowViewModel extends Observable<SignUpFlowState> {
  private readonly termsViewModel: TermsViewModel;
  private documentViewModel: TermsDocumentViewModel | null = null;
  private signatureViewModel: SignatureFlowViewModel | null = null;
  private released = false;

  constructor(private readonly deps: SignUpFlowDeps) {
    super({ step: 'terms', openDocument: null });
    this.termsViewModel = new TermsViewModel({
      openDocument: (kind) => this.openDocument(kind),
      onNext: () => this.openSignature(),
      onBack: () => this.back(),
    });
  }

  get terms(): TermsViewModel {
    return this.termsViewModel;
  }

  /** openDocument가 null이면 null. */
  get document(): TermsDocumentViewModel | null {
    return this.documentViewModel;
  }

  /** step이 'signature'인 동안에만 값이 있다. */
  get signature(): SignatureFlowViewModel | null {
    return this.signatureViewModel;
  }

  /** 소유자가 만든 직후 한 번: screen_view terms. */
  start(): void {
    this.deps.analytics.screenView('terms');
  }

  closeDocument(): void {
    if (this.documentViewModel === null) return;
    this.documentViewModel.dispose();
    this.documentViewModel = null;
    this.setState({ ...this.getSnapshot(), openDocument: null });
  }

  /** 하드웨어 뒤로 / 화면 뒤로. */
  back(): void {
    if (this.released) return;
    if (this.documentViewModel !== null) this.closeDocument();
    else if (this.signatureViewModel !== null) this.signatureViewModel.back();
    else this.deps.authNavigator.toLogin();
  }

  override dispose(): void {
    this.released = true;
    this.documentViewModel?.dispose();
    this.documentViewModel = null;
    this.signatureViewModel?.dispose();
    this.signatureViewModel = null;
    this.termsViewModel.dispose();
    super.dispose();
  }

  private openDocument(kind: TermsKind): void {
    if (this.released || this.documentViewModel !== null) return;
    const document = new TermsDocumentViewModel({
      kind,
      url: TERMS_URLS[kind],
      analytics: this.deps.analytics,
      linkOpener: this.deps.linkOpener,
    });
    this.documentViewModel = document;
    this.setState({ ...this.getSnapshot(), openDocument: kind });
    void document.start().then(() => {
      // 외부 브라우저로 열렸으면 앱 안 시트는 필요 없다.
      const { inAppUrl, status } = document.getSnapshot();
      if (this.documentViewModel === document && inAppUrl === null && status === 'loaded') {
        this.closeDocument();
      }
    });
  }

  private openSignature(): void {
    if (this.released || this.signatureViewModel !== null) return;
    const flow = this.deps.createSignatureFlow({
      onCompleted: () => this.complete(),
      onExit: () => this.leaveSignature(),
    });
    this.signatureViewModel = flow;
    this.setState({ ...this.getSnapshot(), step: 'signature' });
    flow.start();
  }

  /** 사인 그리기에서 뒤로: 사인 흐름을 버리고 약관으로(동의 상태는 유지). */
  private leaveSignature(): void {
    this.signatureViewModel?.dispose();
    this.signatureViewModel = null;
    this.setState({ ...this.getSnapshot(), step: 'terms' });
  }

  private complete(): void {
    if (this.released) return;
    this.deps.pushRegistrar.registerDevice().catch(() => undefined);
    this.deps.authNavigator.toMain('member');
  }
}
