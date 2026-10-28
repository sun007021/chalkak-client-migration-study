import { ViewModel } from '../../core/state/ViewModel';
import type { ToastController } from '../../core/ui/ToastController';
import type { SignatureMode } from './SignatureMode';
import type { SignatureSubmitter } from './SignatureSubmitter';

export interface SignaturePreviewState {
  /** 요청 중(PENDING 재시도 대기 포함). 확정·다시 그리기 버튼 비활성, 진행 표시. 성공 뒤에는 true로 둔다(이동 중 연타 방지). */
  busy: boolean;
}

export type SignaturePreviewOutcome =
  /** 가입 완료. 메인(홈)으로, 가입 화면은 백스택에서 제거. */
  | { kind: 'home' }
  /** 사인 변경 완료. 설정으로 돌아가 사인 카드를 다시 불러온다. */
  | { kind: 'settings' }
  /** 그리기 화면으로(다시 그리기, 서버가 사인을 거절). */
  | { kind: 'draw' }
  /** 로그인 화면으로(만료, 가입의 차단). */
  | { kind: 'login' }
  /** 미리보기에 머문다(실패, 이미 진행 중). 사인(png)은 그대로라 다시 누르면 처음부터 다시 시작. */
  | { kind: 'stay' }
  /** dispose 또는 계정 전환 등으로 결과를 버렸다. */
  | { kind: 'cancelled' };

export interface SignaturePreviewViewModelDeps {
  mode: SignatureMode;
  png: Blob;
  submitter: SignatureSubmitter;
  toast: ToastController;
  /** 변경 성공 뒤 GET /users/me/signature 재조회(D-18). 가입 모드에서는 부르지 않는다. 결과를 기다리지 않는다. */
  refreshSignatureCard?: () => Promise<void>;
}

/**
 * 미리보기 상태(REQ-ONB-012·017·020, REQ-SIGN-017~028). 모든 오류 문구는 토스트로 보인다(화면을 떠나는 경우 포함, 토스트는 전역).
 * confirm: busy면 stay(submitter 호출 1회). 성공 → 가입: home / 변경: 토스트 sign.change.done + refreshSignatureCard + settings.
 * 실패 → signatureFailureMessage 문구 토스트. invalid → draw, expired → login, 가입의 forbidden → login, 그 밖(변경의 forbidden 포함)은 stay이고 busy 해제.
 * cancelled → 토스트 없이 busy만 해제(dispose 뒤에는 상태도 안 바꾼다). redraw: busy면 stay, 아니면 draw(서버 호출 없음).
 * dispose: 진행 중 요청을 abort하고 이후 토스트·결과를 내지 않는다.
 */
export class SignaturePreviewViewModel extends ViewModel<SignaturePreviewState> {
  constructor(private readonly _deps: SignaturePreviewViewModelDeps) {
    super({ busy: false });
  }

  get mode(): SignatureMode {
    return this._deps.mode;
  }

  confirm(): Promise<SignaturePreviewOutcome> {
    throw new Error('not implemented');
  }

  redraw(): SignaturePreviewOutcome {
    throw new Error('not implemented');
  }
}
