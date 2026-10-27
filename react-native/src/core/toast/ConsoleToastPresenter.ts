import type { ToastPresenter } from './ToastPresenter';

/**
 * 화면에 그리지 않고 로그만 남기는 임시 토스트 구현. 토스트를 실제로 그리는 구현(ToastCenter + ToastHost)이
 * 들어오면 AppContainer 기본값을 그것으로 바꾼다.
 */
export class ConsoleToastPresenter implements ToastPresenter {
  show(message: string): void {
    console.log(`[toast] ${message}`);
  }
}
