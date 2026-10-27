import type { SessionStore } from '../../core/auth/SessionStore';
import type { Logger } from '../../core/net/Logger';
import { ViewModel } from '../../core/state/ViewModel';
import type { Clock } from '../../core/time/Clock';
import type { AuthGateDecision } from './authGate';
import type { HomePreloader } from './HomePreloader';

export type BootState =
  /** 세션을 읽는 중이거나 홈 프리로드를 기다리는 중. 스플래시만 보인다. */
  | { phase: 'splash' }
  /** preloadFailed: 프리로드가 오류로 끝났다(홈이 오류 상태로 열린다, D-20). */
  | { phase: 'ready'; decision: AuthGateDecision; preloadFailed: boolean };

/**
 * 스플래시 → (Web은 강제 업데이트 게이트 없음) → 인증 게이트. REQ-BOOT-003/004.
 * - 판정이 login이면 프리로드를 부르지 않고 바로 ready.
 * - 판정이 home이면 preloader.preload(mode)를 시작하고, 끝나거나 SPLASH_PRELOAD_MAX_MS(Clock.sleep)가 지나는 쪽에서 ready.
 *   프리로드가 거절되면 즉시 ready(preloadFailed: true). 상한이 지난 뒤의 프리로드 결과는 상태를 바꾸지 않는다.
 */
export class BootViewModel extends ViewModel<BootState> {
  constructor(_deps: { store: SessionStore; clock: Clock; preloader: HomePreloader; logger?: Logger }) {
    super({ phase: 'splash' });
  }
  /** 한 번만 시작한다(StrictMode의 이중 호출에도 프리로드·세션 읽기는 한 번). 끝나면 resolve. */
  start(): Promise<void> {
    throw new Error('not implemented');
  }
  override dispose(): void {
    throw new Error('not implemented');
  }
}
