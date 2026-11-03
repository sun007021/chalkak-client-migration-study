import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import { Observable } from '../../core/state/Observable';
import { t } from '../../shared/copy';
import { CancelledError } from '../../core/http/ApiError';
import type { UserDataCache } from '../../core/push/UserDataCache';
import type { AuthFlowNavigator } from '../auth/AuthFlowNavigator';
import { AuthErrorPolicy } from '../common/AuthErrorPolicy';
import type { SignatureRepository } from '../../data/signature/SignatureRepository';

export type SignatureCardState = {
  /** 보여 줄 이미지(썸네일 우선). 없으면 null(빈 상태). */
  imageUrl: string | null;
  loading: boolean;
  /** 보이던 사인이 없는 채로 조회가 실패했다(오류 문구 + 다시 불러오기, TC-SET-006). 성공하거나 초기화되면 false. */
  loadError: boolean;
};

/** 설정의 "사인 재설정" 카드를 위한 진입 인터페이스. 설정 화면이 소유자가 되어 만들고 버린다. */
export interface SignatureChangeNavigator {
  openSignatureChange(): void;
}

export type SignatureCardDeps = {
  repository: SignatureRepository;
  toast: ToastPresenter;
  navigator: SignatureChangeNavigator;
  /** 갱신 뒤에도 남은 401에서 로그인으로 보낸다(만료는 세션 이벤트가 처리). */
  authFlow: Pick<AuthFlowNavigator, 'toLogin'>;
};

export class SignatureCardViewModel
  extends Observable<SignatureCardState>
  implements UserDataCache
{
  private abortController: AbortController | null = null;
  private released = false;
  /** 조회 한 번의 식별자. 변경 성공·계정 전환이 올려 낡은 응답을 버린다. */
  private generation = 0;
  private readonly authErrors: AuthErrorPolicy;

  constructor(private readonly deps: SignatureCardDeps) {
    super({ imageUrl: null, loading: false, loadError: false });
    this.authErrors = new AuthErrorPolicy(deps.authFlow);
  }

  override dispose(): void {
    this.released = true;
    this.abortController?.abort();
    super.dispose();
  }

  /**
   * 설정 탭이 보일 때마다 부른다. 조회 중이면 중복 요청하지 않는다.
   * 실패하면 이미 보이던 사인은 그대로 두고 sign.load.error 토스트(보이던 사인이 없으면 토스트 없이 loadError 상태). SIGNATURE_REGISTRATION_REQUIRED면 빈 상태(토스트 없음).
   */
  async refresh(): Promise<void> {
    if (this.getSnapshot().loading || this.released) return;
    await this.load();
  }

  /** 사인 변경 성공 뒤: 진행 중이던 조회는 낡았으므로 버리고 GET으로 다시 조회한다(D-18). */
  async onSignatureChanged(): Promise<void> {
    if (this.released) return;
    await this.load();
  }

  /** 로그아웃·계정 전환: 진행 중 조회를 버리고 이전 계정의 사인을 지운다. */
  clearAll(): void {
    this.invalidate();
    this.setState({ imageUrl: null, loading: false, loadError: false });
  }

  /** "변경하기". */
  onChangePress(): void {
    this.deps.navigator.openSignatureChange();
  }

  private invalidate(): void {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
  }

  private async load(): Promise<void> {
    this.invalidate();
    const generation = this.generation;
    const controller = new AbortController();
    this.abortController = controller;
    this.setState({ ...this.getSnapshot(), loading: true, loadError: false });
    try {
      const current = await this.deps.repository.getCurrent(controller.signal);
      if (this.released || generation !== this.generation) return;
      this.setState({ imageUrl: current?.imageUrl ?? null, loading: false, loadError: false });
    } catch (error) {
      if (this.released || generation !== this.generation) return;
      this.abortController = null;
      const state = this.getSnapshot();
      // 취소(로그아웃·계정 전환)와 401은 조용히 넘긴다: 만료는 세션 이벤트가, 남은 401은 정책이 로그인으로 보낸다.
      if (error instanceof CancelledError || this.authErrors.handle(error, generation)) {
        this.setState({ ...state, loading: false });
        return;
      }
      const firstLoad = state.imageUrl === null;
      this.setState({ ...state, loading: false, loadError: firstLoad });
      // 보이던 사인이 없으면 카드 안의 오류 상태(문구 + 다시 불러오기)만 보인다. 토스트는 보이던 사인을 두고 실패했을 때만(TC-SET-005/006).
      if (!firstLoad) this.deps.toast.show(t('sign.load.error'));
    }
  }
}
