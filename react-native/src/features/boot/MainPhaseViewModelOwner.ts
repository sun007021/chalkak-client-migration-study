import type { UserDataCache } from '../../core/push/UserDataCache';
import { Observable } from '../../core/state/Observable';
import type { MainMode } from '../auth/AuthFlowNavigator';
import type { BootViewModel } from './BootViewModel';

export type MainPhaseViewModelOwnerState<T> = {
  /** phase가 'main'인 동안에만 값이 있다. */
  viewModel: T | null;
};

export type MainPhaseViewModelOwnerDeps<T> = {
  boot: BootViewModel;
  create: (mode: MainMode) => T;
  /** 만든 ViewModel을 로그아웃·계정 전환 때 비울 캐시 목록에 올린다. 해제 함수를 돌려준다. */
  registerCache: (cache: UserDataCache) => () => void;
};

/**
 * 메인 단계 동안 사는 ViewModel(홈, 전시)의 소유자. 화면이 아니라 앱 단계(phase)가 만들고 버린다:
 * phase가 'main'에 들어갈 때(회원/게스트 모드와 함께) 만들어 캐시 목록에 올리고, 떠나면(로그아웃 등) 해제·dispose한다.
 * 탭을 오가며 화면이 마운트·언마운트돼도 ViewModel과 그 내용은 이 소유자가 유지한다.
 */
export class MainPhaseViewModelOwner<
  T extends UserDataCache & { dispose(): void },
> extends Observable<MainPhaseViewModelOwnerState<T>> {
  private readonly unsubscribe: () => void;
  private unregister: (() => void) | null = null;
  private mode: MainMode | null = null;

  constructor(private readonly deps: MainPhaseViewModelOwnerDeps<T>) {
    super({ viewModel: null });
    this.sync();
    this.unsubscribe = deps.boot.subscribe(() => this.sync());
  }

  override dispose(): void {
    this.unsubscribe();
    this.release();
    super.dispose();
  }

  private sync(): void {
    const { phase, mode } = this.deps.boot.getSnapshot();
    const wanted = phase === 'main' ? mode : null;
    if (wanted === this.mode) return;
    this.release();
    if (wanted === null) return;
    const viewModel = this.deps.create(wanted);
    this.unregister = this.deps.registerCache(viewModel);
    this.mode = wanted;
    this.setState({ viewModel });
  }

  private release(): void {
    const { viewModel } = this.getSnapshot();
    this.unregister?.();
    this.unregister = null;
    this.mode = null;
    if (viewModel === null) return;
    viewModel.dispose();
    this.setState({ viewModel: null });
  }
}
