import { Observable } from '../../core/state/Observable';
import type { MainMode } from '../auth/AuthFlowNavigator';
import type { BootViewModel } from '../boot/BootViewModel';
import type { UploadEntryGateViewModel } from './UploadEntryGateViewModel';

export type UploadEntryGateOwnerState = {
  /** phase가 'main'인 동안에만 값이 있다. */
  viewModel: UploadEntryGateViewModel | null;
};

export type UploadEntryGateOwnerDeps = {
  boot: BootViewModel;
  create: (mode: MainMode) => UploadEntryGateViewModel;
};

/**
 * 업로드 진입 게이트의 소유자. 메인 단계(회원/게스트 모드)에 들어갈 때 만들고 떠나면 dispose한다
 * (진행 중인 확인 요청은 취소된다). 홈·하단 바 어디서 눌러도 같은 게이트 하나를 쓰므로 연타가 한 번만 처리된다.
 * 사용자별 캐시를 가지지 않아 캐시 레지스트리에는 올리지 않는다.
 */
export class UploadEntryGateOwner extends Observable<UploadEntryGateOwnerState> {
  private readonly unsubscribe: () => void;
  private mode: MainMode | null = null;

  constructor(private readonly deps: UploadEntryGateOwnerDeps) {
    super({ viewModel: null });
    this.sync();
    this.unsubscribe = deps.boot.subscribe(() => this.sync());
  }

  /** 하단 바·홈이 부르는 진입점. 메인 단계 밖이면 무시한다. */
  press(): void {
    void this.getSnapshot().viewModel?.press();
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
    this.mode = wanted;
    this.setState({ viewModel: this.deps.create(wanted) });
  }

  private release(): void {
    const { viewModel } = this.getSnapshot();
    this.mode = null;
    if (viewModel === null) return;
    viewModel.dispose();
    this.setState({ viewModel: null });
  }
}
