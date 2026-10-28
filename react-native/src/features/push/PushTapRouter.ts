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
  private stopped = false;

  constructor(private readonly deps: PushTapRouterDeps) {}

  start(): () => void {
    this.stopped = false;
    const { responses, boot, blocker } = this.deps;
    const stops = [
      responses.subscribe((data) => this.enqueue(() => this.accept(data))),
      boot.subscribe(() => this.enqueue(() => this.drain())),
      blocker.subscribe(() => this.enqueue(() => this.drain())),
    ];
    this.enqueue(() => this.restore());
    return () => {
      this.stopped = true;
      stops.forEach((stop) => stop());
    };
  }

  private enqueue(step: () => Promise<void>): void {
    this.chain = this.chain.then(step).catch((error: unknown) => {
      // 한 탭의 처리 실패가 다음 탭을 막지 않게 한다.
      console.warn('[PushTapRouter] step failed', error instanceof Error ? error.name : 'unknown');
    });
  }

  /** 이전 프로세스가 남긴 보류분과 콜드 스타트 탭을 이어받는다(콜드 스타트 탭이 더 새롭다). */
  private async restore(): Promise<void> {
    const saved = await this.deps.store.load();
    if (saved !== null && this.pending === null) {
      this.pending = saved;
      this.pendingGeneration = this.deps.sessionStore.generation();
    }
    const initial = await this.deps.responses.consumeInitial();
    if (initial !== null) await this.setPending(initial);
    await this.drain();
  }

  private async accept(data: PushData): Promise<void> {
    await this.setPending(data);
    await this.drain();
  }

  private async setPending(data: PushData): Promise<void> {
    this.pending = data;
    this.pendingGeneration = this.deps.sessionStore.generation();
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
    if (this.pending !== data) return;
    if (decision === 'defer') return;
    const sameAccount = this.pendingGeneration === this.deps.sessionStore.generation();
    await this.clear();
    if (decision === 'discard' || !sameAccount) return;
    const { type, notificationId, sourceType, sourceId } = parsePushPayload(data);
    await this.deps.processor.process({ type, notificationId, sourceType, sourceId }, 'push');
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
