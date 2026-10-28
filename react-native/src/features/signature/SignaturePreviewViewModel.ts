import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { mapSignatureError, type SignatureMode } from './mapSignatureError';
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
  private readonly abortController = new AbortController();
  private errorSeq = 0;
  private committingNow = false;

  constructor(private readonly deps: SignaturePreviewDeps) {
    super({ mode: deps.mode, busy: false, error: null });
  }

  /** 서버가 요청을 받아 준 뒤 세션 저장·완료 통지 중. 이때는 취소하지 않으므로 호출자는 뒤로가기를 막는다. */
  get committing(): boolean {
    return this.committingNow;
  }

  get png(): Uint8Array {
    return this.deps.png;
  }

  override dispose(): void {
    this.abortController.abort();
    super.dispose();
  }

  async confirm(): Promise<void> {
    if (this.getSnapshot().busy || this.isDisposed()) return;
    this.setState({ ...this.getSnapshot(), busy: true, error: null });
    try {
      await this.deps.submitter.submit(this.deps.png, this.abortController.signal, {
        onCommit: () => {
          this.committingNow = true;
        },
      });
    } catch (error) {
      this.committingNow = false;
      if (!this.isDisposed()) this.handleFailure(error);
      return;
    }
    this.committingNow = false;
    if (this.isDisposed()) return;
    this.setState({ ...this.getSnapshot(), busy: false });
    this.deps.host.onCompleted();
  }

  redraw(): void {
    if (this.getSnapshot().busy || this.isDisposed()) return;
    this.deps.host.onRedraw();
  }

  dismissError(): void {
    this.setState({ ...this.getSnapshot(), error: null });
  }

  private handleFailure(error: unknown): void {
    const { host, toast, authNavigator, mode } = this.deps;
    const failure = mapSignatureError(error, mode);
    this.setState({ ...this.getSnapshot(), busy: false });
    switch (failure.kind) {
      case 'ignore':
        return;
      case 'toast':
        toast.show(failure.message);
        return;
      case 'login':
        toast.show(failure.message);
        authNavigator.toLogin();
        return;
      case 'message':
        if (failure.backToDraw) {
          host.onRejected(failure.message);
        } else {
          this.errorSeq += 1;
          this.setState({
            ...this.getSnapshot(),
            error: { id: this.errorSeq, message: failure.message },
          });
        }
    }
  }

  private isDisposed(): boolean {
    return this.abortController.signal.aborted;
  }
}
