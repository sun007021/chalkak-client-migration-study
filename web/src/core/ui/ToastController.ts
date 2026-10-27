import { TOAST_DURATION_MS } from '../../constants';
import { ViewModel } from '../state/ViewModel';
import type { Clock } from '../time/Clock';
import type { IdGenerator } from '../ids';

export interface Toast {
  /** 메시지마다 고유. 같은 문구가 연달아 나와도 다르다. */
  id: string;
  message: string;
}

export interface ToastState {
  toast: Toast | null;
}

/** 토스트 하나를 TOAST_DURATION_MS(2.5초) 동안 보인다. 화면이 보일 때만 받는다(보이지 않을 땐 버림). */
export class ToastController extends ViewModel<ToastState> {
  private visible = true;
  private timer: AbortController | null = null;

  constructor(private readonly deps: { clock: Clock; ids: IdGenerator }) {
    super({ toast: null });
  }

  show(message: string): void {
    if (!this.visible) return;
    const toast: Toast = { id: this.deps.ids.next(), message };
    this.cancelTimer();
    this.setState({ toast });
    void this.expireAfterDuration(toast);
  }

  /** 앱/화면이 보이는지. false가 되면 떠 있는 토스트도 지운다. 기본 true. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.clear();
  }

  override dispose(): void {
    this.cancelTimer();
    super.dispose();
  }

  private clear(): void {
    this.cancelTimer();
    this.setState({ toast: null });
  }

  private cancelTimer(): void {
    this.timer?.abort();
    this.timer = null;
  }

  private async expireAfterDuration(toast: Toast): Promise<void> {
    const timer = new AbortController();
    this.timer = timer;
    try {
      await this.deps.clock.sleep(TOAST_DURATION_MS, timer.signal);
    } catch {
      return; // 새 토스트 또는 숨김으로 취소됨
    }
    if (this.state.toast?.id === toast.id) {
      this.timer = null;
      this.setState({ toast: null });
    }
  }
}
