import { ViewModel } from '../../core/state/ViewModel';
import type { WithdrawOutcome } from '../auth/AccountService';
import type { SessionMode } from '../boot/authGate';
import type { LegalDocumentKind, LegalOpenResult } from '../onboarding/LegalDocument';

export interface SettingsViewModelDeps {
  mode: SessionMode;
  /** 설정 사인 카드(SignatureCardController). */
  signatureCard: { refresh(): Promise<void> };
  /** 푸시 수신 설정(NotificationSettingsStore). */
  notifications: { load(): Promise<void>; cancelPending(): void };
  /** AccountService. */
  account: { logout(): Promise<void>; withdraw(signal?: AbortSignal): Promise<WithdrawOutcome> };
  /** LegalDocumentLauncher. */
  launcher: { open(kind: LegalDocumentKind): LegalOpenResult };
  /** 게스트 "로그인": 게스트 플래그를 지운다(SessionStore.clear). */
  session: { clear(): Promise<void> };
  /** 버전정보 행의 값(빌드 버전 문자열 그대로). */
  appVersion: string;
}

export interface SettingsState {
  mode: SessionMode;
  appVersion: string;
  /** 열려 있는 확인 대화상자. */
  dialog: 'logout' | 'withdraw' | null;
  /** 확인 후 처리 중인 계정 작업(해당 확인 버튼 비활성, 중복 요청 방지 REQ-AUTH-040). */
  busy: 'logout' | 'withdraw' | null;
  /** 마지막 약관 문서 열기가 실패했다(legal-doc.open-failed-message). 다시 열기에 성공하면 false. */
  documentOpenFailed: boolean;
}

export type SettingsLoginOutcome = { kind: 'login' };

/**
 * W11 구현 대기(스텁). 설정 탭 화면 상태(REQ-SET-001~007, REQ-AUTH-032~040).
 * onShown: 회원이면 사인 카드 refresh와 푸시 설정 load를 서로 독립으로 시작한다(한쪽 실패가 다른 쪽을 막지 않는다). 게스트는 API를 부르지 않는다. onHidden: 푸시 저장 취소(cancelPending).
 * requestLogout/requestWithdraw: 회원이면 확인 대화상자를 연다. cancelDialog: 닫는다(API 0건, 처리 중이면 무시). confirmLogout/confirmWithdraw: 처리 중 중복 호출은 무시, 끝나면 대화상자를 닫는다.
 * openDocument: 약관 문서 열기. pressLogin(게스트): 게스트 플래그를 지우고 { kind: 'login' }.
 */
export class SettingsViewModel extends ViewModel<SettingsState> {
  constructor(private readonly deps: SettingsViewModelDeps) {
    super({ mode: deps.mode, appVersion: deps.appVersion, dialog: null, busy: null, documentOpenFailed: false });
  }

  onShown(): void {
    void this.deps;
    throw new Error('not implemented');
  }

  onHidden(): void {
    throw new Error('not implemented');
  }

  requestLogout(): void {
    throw new Error('not implemented');
  }

  requestWithdraw(): void {
    throw new Error('not implemented');
  }

  cancelDialog(): void {
    throw new Error('not implemented');
  }

  confirmLogout(): Promise<void> {
    throw new Error('not implemented');
  }

  confirmWithdraw(): Promise<void> {
    throw new Error('not implemented');
  }

  openDocument(kind: LegalDocumentKind): LegalOpenResult {
    void kind;
    throw new Error('not implemented');
  }

  pressLogin(): Promise<SettingsLoginOutcome> {
    throw new Error('not implemented');
  }
}
