import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
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
  constructor(private readonly deps: SignatureCardDeps) {
    super({ imageUrl: null, loading: false });
  }

  /**
   * 설정 탭이 보일 때마다 부른다. 조회 중이면 중복 요청하지 않는다.
   * 실패하면 이미 보이던 사인은 그대로 두고 sign.load.error 토스트. SIGNATURE_REGISTRATION_REQUIRED면 빈 상태(토스트 없음).
   */
  async refresh(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** "변경하기". */
  onChangePress(): void {
    throw new Error('not implemented');
  }
}
