import type { AppVisibility } from '../lifecycle/AppVisibility';
import { Observable } from '../state/Observable';
import type { ToastPresenter } from './ToastPresenter';

export type ToastState = {
  /** 지금 떠 있는 토스트. 같은 문구도 `id`가 달라 매번 새로 그려진다(REQ-NET-030). */
  current: { id: number; message: string } | null;
};

export type ToastCenterDeps = {
  visibility: AppVisibility;
  /** TOAST_DURATION_MS(2.5초). */
  durationMs: number;
};

/**
 * 토스트 상태 저장소(ToastPresenter 구현). 화면의 ToastHost가 구독해 그린다.
 * 새 토스트는 이전 것을 대체하고 타이머를 다시 시작한다. 앱이 백그라운드이면 보여 줄 수 없으므로 버린다.
 */
export class ToastCenter extends Observable<ToastState> implements ToastPresenter {
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: ToastCenterDeps) {
    super({ current: null });
  }

  show(message: string): void {
    if (this.deps.visibility.current() === 'background') return;
    this.clearTimer();
    this.setState({ current: { id: this.nextId++, message } });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.setState({ current: null });
    }, this.deps.durationMs);
  }

  override dispose(): void {
    this.clearTimer();
    super.dispose();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
