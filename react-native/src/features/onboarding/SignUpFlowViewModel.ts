import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { ExternalLinkOpener } from '../../core/link/ExternalLinkOpener';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import { Observable } from '../../core/state/Observable';
import type { PendingSignUp } from '../../data/auth/AuthRepository';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { SignatureFlowViewModel } from '../signature/SignatureFlowViewModel';
import type { TermsDocumentViewModel } from './TermsDocumentViewModel';
import type { TermsKind, TermsViewModel } from './TermsViewModel';

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
  externalLinkOpener: ExternalLinkOpener;
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
  constructor(private readonly deps: SignUpFlowDeps) {
    super({ step: 'terms', openDocument: null });
  }

  get terms(): TermsViewModel {
    throw new Error('not implemented');
  }

  /** openDocument가 null이면 null. */
  get document(): TermsDocumentViewModel | null {
    throw new Error('not implemented');
  }

  /** step이 'signature'인 동안에만 값이 있다. */
  get signature(): SignatureFlowViewModel | null {
    throw new Error('not implemented');
  }

  /** 소유자가 만든 직후 한 번: screen_view terms. */
  start(): void {
    throw new Error('not implemented');
  }

  closeDocument(): void {
    throw new Error('not implemented');
  }

  /** 하드웨어 뒤로 / 화면 뒤로. */
  back(): void {
    throw new Error('not implemented');
  }
}
