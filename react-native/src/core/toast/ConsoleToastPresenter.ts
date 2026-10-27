import type { ToastPresenter } from './ToastPresenter';

/**
 * 임시 구현: 홈 PR의 ToastCenter(+ToastHost)로 교체 예정이다. 화면에 그리지 않고 개발 빌드에서만 로그를 남긴다.
 * 실제 호스트는 홈 머지 후에 붙인다.
 */
export class ConsoleToastPresenter implements ToastPresenter {
  show(message: string): void {
    if (__DEV__) console.log(`[toast] ${message}`);
  }
}
