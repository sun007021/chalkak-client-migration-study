import type { PendingSignUp } from '../../data/auth/AuthRepository';
import type { AuthSessionEvents } from '../../core/http/AuthSessionEvents';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import { Observable } from '../../core/state/Observable';
import type { AuthFlowNavigator, MainMode } from '../auth/AuthFlowNavigator';
import type { AuthGate } from './AuthGate';
import type { ForceUpdateGate } from './ForceUpdateGate';
import type { HomePreloader } from './HomePreloader';

export type BootPhase = 'splash' | 'update-required' | 'login' | 'sign-up' | 'main';

export type BootState = {
  phase: BootPhase;
  /** phase가 'main'일 때만 값이 있다. */
  mode: MainMode | null;
  /** phase가 'sign-up'일 때만 값이 있다(메모리에만). */
  pendingSignUp: PendingSignUp | null;
};

export type BootViewModelDeps = {
  forceUpdateGate: ForceUpdateGate;
  authGate: AuthGate;
  homePreloader: HomePreloader;
  pushRegistrar: PushRegistrar;
  events: AuthSessionEvents;
  /** 기본 SPLASH_PRELOAD_MAX_MS(700). 프리로드 대기 상한이며 프리로드 시작부터 센다. */
  splashPreloadMaxMs?: number;
};

/**
 * 시작 흐름(스플래시 -> 업데이트 게이트 -> 인증 게이트)과 이후 화면 전환의 단일 출처.
 * 앞 단계가 끝나기 전에는 다음 phase로 가지 않는다. 로그인 화면이 목적지면 프리로드를 기다리지 않는다.
 * AuthFlowNavigator를 구현해 로그인·설정 ViewModel이 전환을 요청한다.
 */
export class BootViewModel extends Observable<BootState> implements AuthFlowNavigator {
  constructor(private readonly deps: BootViewModelDeps) {
    super({ phase: 'splash', mode: null, pendingSignUp: null });
  }

  /** 콜드 스타트. 세션 만료 이벤트(AuthSessionEvents)도 여기서 구독해 로그인으로 보낸다. */
  start(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** iOS 계열: 앱 재활성화 시 게이트 재확인. */
  onAppActive(): Promise<void> {
    throw new Error('not implemented');
  }

  /** Android 계열: 오프라인 -> 온라인 시 게이트 재확인. */
  onOnline(): Promise<void> {
    throw new Error('not implemented');
  }

  toMain(_mode: MainMode): void {
    throw new Error('not implemented');
  }

  toSignUp(_pending: PendingSignUp): void {
    throw new Error('not implemented');
  }

  toLogin(): void {
    throw new Error('not implemented');
  }

  override dispose(): void {
    throw new Error('not implemented');
  }
}
