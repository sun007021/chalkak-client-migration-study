import { ViewModel } from '../../core/state/ViewModel';
import type { SignupDraft } from '../auth/SignupDraft';
import type { LegalDocumentKind, LegalDocumentLauncher, LegalOpenResult } from './LegalDocument';

export interface TermsState {
  serviceAgreed: boolean;
  privacyAgreed: boolean;
  /** 두 필수 항목이 모두 켜졌을 때만 true(전체 동의 표시는 파생값). */
  allAgreed: boolean;
  /** allAgreed와 같다. "다음" 활성 조건. */
  canProceed: boolean;
  /** 마지막 "보기"가 열리지 못했다. 다시 열기에 성공하거나 화면을 떠나면 false. */
  openFailed: boolean;
}

export type TermsOutcome =
  /** 사인 그리기(가입)로. */
  | { kind: 'signature' }
  /** 로그인으로. 가입 컨텍스트(idToken·rawNonce)를 폐기했다. */
  | { kind: 'login' }
  | { kind: 'stay' };

export interface TermsViewModelDeps {
  launcher: LegalDocumentLauncher;
  signupDraft: SignupDraft;
}

/**
 * 약관 화면 상태(REQ-ONB-002~007, 010). 동의는 메모리에만 있고 저장·전송하지 않는다(D-25). 화면이 마운트될 때마다 새로 만들어 모두 해제로 시작한다.
 */
export class TermsViewModel extends ViewModel<TermsState> {
  constructor(private readonly deps: TermsViewModelDeps) {
    super({ serviceAgreed: false, privacyAgreed: false, allAgreed: false, canProceed: false, openFailed: false });
  }

  /** 전체 동의가 꺼져 있으면 두 항목을 모두 켜고, 켜져 있으면 모두 끈다. */
  toggleAll(): void {
    this.apply(!this.state.allAgreed, !this.state.allAgreed);
  }

  toggleService(): void {
    this.apply(!this.state.serviceAgreed, this.state.privacyAgreed);
  }

  togglePrivacy(): void {
    this.apply(this.state.serviceAgreed, !this.state.privacyAgreed);
  }

  /** 문서를 새 탭으로 연다. 체크 상태는 건드리지 않는다. 열지 못하면 openFailed. */
  openDocument(kind: LegalDocumentKind): LegalOpenResult {
    const result = this.deps.launcher.open(kind);
    this.setState({ openFailed: result !== 'opened' });
    return result;
  }

  /** canProceed이면 signature, 아니면 stay. */
  next(): TermsOutcome {
    return this.state.canProceed ? { kind: 'signature' } : { kind: 'stay' };
  }

  /** 가입 컨텍스트를 폐기하고 login(REQ-ONB-027). */
  back(): TermsOutcome {
    this.deps.signupDraft.clear();
    return { kind: 'login' };
  }

  private apply(serviceAgreed: boolean, privacyAgreed: boolean): void {
    const allAgreed = serviceAgreed && privacyAgreed;
    this.setState({ serviceAgreed, privacyAgreed, allAgreed, canProceed: allAgreed });
  }
}
