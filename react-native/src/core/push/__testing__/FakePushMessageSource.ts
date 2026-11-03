import type { PushMessage, PushMessageSource } from '../PushMessageSource';

export class FakePushMessageSource implements PushMessageSource {
  private readonly listeners = new Set<(message: PushMessage) => void>();

  subscribe(listener: (message: PushMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 앱이 실행 중일 때 푸시가 도착했다. */
  receive(message: PushMessage): void {
    [...this.listeners].forEach((listener) => listener(message));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
