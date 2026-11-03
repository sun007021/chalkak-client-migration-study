import type { NotificationResponseSource, PushData } from '../NotificationResponseSource';

export class FakeNotificationResponseSource implements NotificationResponseSource {
  private readonly listeners = new Set<(data: PushData) => void>();
  consumeInitialCalls = 0;

  /** 콜드 스타트 탭. 처음 consumeInitial에서 한 번만 돌려준다. */
  constructor(private initial: PushData | null = null) {}

  async consumeInitial(): Promise<PushData | null> {
    this.consumeInitialCalls += 1;
    const value = this.initial;
    this.initial = null;
    return value;
  }

  subscribe(listener: (data: PushData) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 앱이 떠 있는 동안(백그라운드·포그라운드) 알림을 탭했다. */
  tap(data: PushData): void {
    [...this.listeners].forEach((listener) => listener(data));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
