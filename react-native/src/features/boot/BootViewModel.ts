import { SPLASH_PRELOAD_MAX_MS } from '../../shared/constants';
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

  private started = false;
  private splashTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly cleanups: (() => void)[] = [];

  /** 콜드 스타트. 세션 만료 이벤트(AuthSessionEvents)도 여기서 구독해 로그인으로 보낸다. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const { forceUpdateGate, authGate, events } = this.deps;
    this.cleanups.push(
      events.subscribe((event) => event.type === 'session-expired' && this.toLogin()),
    );
    this.cleanups.push(
      forceUpdateGate.subscribe(() => {
        if (forceUpdateGate.getSnapshot().blocked) this.showUpdateRequired();
      }),
    );

    await forceUpdateGate.check();
    if (this.isBlocked()) return;

    const decision = await authGate.resolve();
    if (this.isBlocked()) return;
    if (decision.kind === 'signed-out') {
      this.toLogin();
      return;
    }
    const mode: MainMode = decision.kind === 'guest' ? 'guest' : 'member';
    if (mode === 'member') this.registerPush();
    await this.preloadWithinSplashLimit(mode);
    // 대기 중 세션 만료 등으로 이미 다른 화면이 정해졌으면 덮어쓰지 않는다.
    if (this.getSnapshot().phase === 'splash') this.toMain(mode);
  }

  /** iOS 계열: 앱 재활성화 시 게이트 재확인. */
  onAppActive(): Promise<void> {
    return this.deps.forceUpdateGate.check();
  }

  /** Android 계열: 오프라인 -> 온라인 시 게이트 재확인. */
  onOnline(): Promise<void> {
    return this.deps.forceUpdateGate.check();
  }

  toMain(mode: MainMode): void {
    this.transition({ phase: 'main', mode, pendingSignUp: null });
  }

  toSignUp(pending: PendingSignUp): void {
    this.transition({ phase: 'sign-up', mode: null, pendingSignUp: pending });
  }

  toLogin(): void {
    this.transition({ phase: 'login', mode: null, pendingSignUp: null });
  }

  override dispose(): void {
    this.clearSplashTimer();
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    super.dispose();
  }

  private isBlocked(): boolean {
    return this.getSnapshot().phase === 'update-required';
  }

  private showUpdateRequired(): void {
    this.setState({ phase: 'update-required', mode: null, pendingSignUp: null });
  }

  /** 강제 업데이트 상태에서는 다른 화면으로 가는 요청을 모두 무시한다. */
  private transition(next: BootState): void {
    if (this.isBlocked()) return;
    this.setState(next);
  }

  private registerPush(): void {
    this.deps.pushRegistrar.registerDevice().catch(() => undefined);
  }

  /** 프리로드 시작부터 센다. 프리로드가 끝나거나 실패하거나 상한이 지나면 반환한다. */
  private preloadWithinSplashLimit(mode: MainMode): Promise<void> {
    const limitMs = this.deps.splashPreloadMaxMs ?? SPLASH_PRELOAD_MAX_MS;
    return new Promise<void>((resolve) => {
      this.splashTimer = setTimeout(resolve, limitMs);
      this.deps.homePreloader.preload(mode).then(resolve, resolve);
    }).finally(() => this.clearSplashTimer());
  }

  private clearSplashTimer(): void {
    if (this.splashTimer === null) return;
    clearTimeout(this.splashTimer);
    this.splashTimer = null;
  }
}
