import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
import { t } from '../../shared/copy';
import {
  AuthenticationRequiredError,
  CancelledError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import type { SignatureRepository } from '../../data/signature/SignatureRepository';

export type SignatureCardState = {
  /** 보여 줄 이미지(썸네일 우선). 없으면 null(빈 상태). */
  imageUrl: string | null;
  loading: boolean;
};

/** 설정의 "사인 재설정" 카드를 위한 진입 인터페이스. 설정 화면(PR11)이 소유자가 되어 만들고 버린다. */
export interface SignatureChangeNavigator {
  openSignatureChange(): void;
}

export type SignatureCardDeps = {
  repository: SignatureRepository;
  toast: ToastPresenter;
  navigator: SignatureChangeNavigator;
};

export class SignatureCardViewModel extends Observable<SignatureCardState> {
  private abortController: AbortController | null = null;
  private released = false;

  constructor(private readonly deps: SignatureCardDeps) {
    super({ imageUrl: null, loading: false });
  }

  override dispose(): void {
    this.released = true;
    this.abortController?.abort();
    super.dispose();
  }

  /**
   * 설정 탭이 보일 때마다 부른다. 조회 중이면 중복 요청하지 않는다.
   * 실패하면 이미 보이던 사인은 그대로 두고 sign.load.error 토스트. SIGNATURE_REGISTRATION_REQUIRED면 빈 상태(토스트 없음).
   */
  async refresh(): Promise<void> {
    if (this.getSnapshot().loading || this.released) return;
    const controller = new AbortController();
    this.abortController = controller;
    this.setState({ ...this.getSnapshot(), loading: true });
    try {
      const current = await this.deps.repository.getCurrent(controller.signal);
      if (this.released) return;
      this.setState({ imageUrl: current?.imageUrl ?? null, loading: false });
    } catch (error) {
      if (this.released) return;
      this.setState({ ...this.getSnapshot(), loading: false });
      // 취소(로그아웃·계정 전환)와 401은 조용히 넘긴다: 로그인 이동은 세션 이벤트가 맡는다.
      if (
        !(error instanceof CancelledError) &&
        !(error instanceof AuthenticationRequiredError) &&
        !(error instanceof ReauthenticationRequiredError)
      ) {
        this.deps.toast.show(t('sign.load.error'));
      }
    }
  }

  /** "변경하기". */
  onChangePress(): void {
    this.deps.navigator.openSignatureChange();
  }
}
