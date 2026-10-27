import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import type { SignatureMode } from './mapSignatureError';
import type { SignatureSubmitter } from './SignatureSubmitter';

export type SignaturePreviewState = {
  mode: SignatureMode;
  /** 요청 중(PENDING 대기 포함). 확인 버튼 비활성 + 진행 표시. */
  busy: boolean;
  /** `id`는 표시마다 증가한다(같은 문구가 연달아 와도 새 알림). */
  error: { id: number; message: string } | null;
};

export type SignaturePreviewHost = {
  /** "다시 그리기". */
  onRedraw(): void;
  /** 서버가 사인을 거절했다. 그리기 화면으로 돌아가 message를 보인다. */
  onRejected(message: string): void;
  /** 가입 완료 또는 변경 성공. 이후 이동(메인, 설정)은 호스트가 한다. */
  onCompleted(): void;
};

export type SignaturePreviewDeps = {
  mode: SignatureMode;
  png: Uint8Array;
  submitter: SignatureSubmitter;
  host: SignaturePreviewHost;
  /** 401(만료)·가입 403일 때 toLogin. */
  authNavigator: AuthFlowNavigator;
  toast: ToastPresenter;
};

/**
 * 확인 버튼(가입 "시작하기" / 변경 "사인 변경하기")의 요청을 한 번만 실행한다.
 * dispose되면 진행 중 요청을 취소하고 이후 결과는 세션 저장·이동·오류 표시 모두 하지 않는다.
 */
export class SignaturePreviewViewModel extends Observable<SignaturePreviewState> {
  constructor(private readonly deps: SignaturePreviewDeps) {
    super({ mode: deps.mode, busy: false, error: null });
  }

  get png(): Uint8Array {
    return this.deps.png;
  }

  async confirm(): Promise<void> {
    throw new Error('not implemented');
  }

  redraw(): void {
    throw new Error('not implemented');
  }

  dismissError(): void {
    throw new Error('not implemented');
  }
}
