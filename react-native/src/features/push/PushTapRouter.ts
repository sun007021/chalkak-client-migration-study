import type {
  NotificationResponseSource,
  PushData,
} from '../../core/push/NotificationResponseSource';
import { parsePushPayload } from '../../core/push/PushPayload';
import type { SessionStore } from '../../core/session/SessionStore';
import type { BootState } from '../boot/BootViewModel';
import type { NotificationTapProcessor } from '../notification/NotificationTapProcessor';
import type { PendingPushStore } from './PendingPushStore';
import type { PushTapBlocker } from './PushTapBlocker';

export type PushTapRouterDeps = {
  responses: NotificationResponseSource;
  boot: { getSnapshot(): Readonly<BootState>; subscribe(listener: () => void): () => void };
  sessionStore: Pick<SessionStore, 'load' | 'generation'>;
  blocker: PushTapBlocker;
  store: PendingPushStore;
  processor: Pick<NotificationTapProcessor, 'process'>;
};

type Decision = 'process' | 'defer' | 'discard';

/**
 * 푸시 탭을 받아 언제 처리할지 정한다(D-11, REQ-PUSH-030~031):
 * 스플래시·가입(세션 있음)·업로드/피드백 작성 중은 보류, 로그아웃·게스트·미인증은 폐기, 메인(회원)이면 처리.
 * 보류분은 하나만 두고(새 탭이 교체) 저장소에 남겨 프로세스 복원에도 유지한다. 보류 중 계정이 바뀌면 폐기한다.
 */
export class PushTapRouter {
  private pending: PushData | null = null;
  private pendingGeneration = 0;
  private chain: Promise<void> = Promise.resolve();
  private stopped = true;
  /** 저장된 보류분과 콜드 스타트 탭은 컨테이너 수명 동안 한 번만 읽는다(StrictMode의 stop -> start에서도). */
  private savedRestored = false;
  private initialConsumed = false;
  /** 처리 중인 탭의 취소 신호: stop과 새 탭(교체)이 끊는다. */
  private inflight: AbortController | null = null;

  constructor(private readonly deps: PushTapRouterDeps) {}

  start(): () => void {
    this.stopped = false;
    const { responses, boot, blocker } = this.deps;
    const stops = [
      responses.subscribe((data) => {
        this.inflight?.abort();
        this.enqueue(() => this.accept(data));
      }),
      boot.subscribe(() => this.enqueue(() => this.drain())),
      blocker.subscribe(() => this.enqueue(() => this.drain())),
    ];
    this.enqueue(() => this.restore());
    return () => {
      this.stopped = true;
      this.inflight?.abort();
      stops.forEach((stop) => stop());
    };
  }

  private enqueue(step: () => Promise<void>): void {
    this.chain = this.chain.then(step).catch((error: unknown) => {
      // 한 탭의 처리 실패가 다음 탭을 막지 않게 한다.
      console.warn('[PushTapRouter] step failed', error instanceof Error ? error.name : 'unknown');
    });
  }

  /**
   * 세션 세대는 부팅의 첫 load에서 처음 올라가므로(undefined -> userId) 읽기 전에 load를 기다린다.
   * 그렇지 않으면 콜드 스타트 탭이 "계정이 바뀌었다"로 버려진다.
   */
  private async currentGeneration(): Promise<number> {
    await this.deps.sessionStore.load();
    return this.deps.sessionStore.generation();
  }

  /**
   * 이전 프로세스가 남긴 보류분과 콜드 스타트 탭을 이어받는다(콜드 스타트 탭이 더 새롭다).
   * 단계마다 결과를 상태에 바로 남기므로 중간에 stop되어도 다음 start가 이어받고, 두 번 읽지 않는다.
   */
  private async restore(): Promise<void> {
    if (!this.savedRestored) {
      const saved = await this.deps.store.load();
      this.savedRestored = true;
      if (saved !== null && this.pending === null) {
        this.pending = saved;
        this.pendingGeneration = await this.currentGeneration();
      }
    }
    if (this.stopped) return;
    if (!this.initialConsumed) {
      this.initialConsumed = true;
      const initial = await this.deps.responses.consumeInitial();
      if (initial !== null) await this.setPending(initial);
    }
    if (this.stopped) return;
    await this.drain();
  }

  private async accept(data: PushData): Promise<void> {
    await this.setPending(data);
    if (this.stopped) return;
    await this.drain();
  }

  private async setPending(data: PushData): Promise<void> {
    this.pending = data;
    this.pendingGeneration = await this.currentGeneration();
    await this.deps.store.save(data);
  }

  private async clear(): Promise<void> {
    if (this.pending === null) return;
    this.pending = null;
    await this.deps.store.save(null);
  }

  private async drain(): Promise<void> {
    const data = this.pending;
    if (data === null || this.stopped) return;
    const decision = await this.decide();
    if (this.pending !== data || this.stopped) return;
    if (decision === 'defer') return;
    const sameAccount = this.pendingGeneration === (await this.currentGeneration());
    await this.clear();
    if (decision === 'discard' || !sameAccount || this.stopped) return;
    const { type, notificationId, sourceType, sourceId } = parsePushPayload(data);
    const controller = new AbortController();
    this.inflight = controller;
    try {
      await this.deps.processor.process(
        { type, notificationId, sourceType, sourceId },
        'push',
        controller.signal,
      );
    } finally {
      if (this.inflight === controller) this.inflight = null;
    }
  }

  private async decide(): Promise<Decision> {
    const { phase, mode } = this.deps.boot.getSnapshot();
    switch (phase) {
      case 'splash':
      case 'update-required':
        return 'defer';
      case 'login':
        return 'discard';
      case 'sign-up':
        return (await this.deps.sessionStore.load()).kind === 'authenticated' ? 'defer' : 'discard';
      case 'main':
        if (mode !== 'member') return 'discard';
        return this.deps.blocker.isBlocked() ? 'defer' : 'process';
    }
  }
}
