import type { PushTokenProvider } from '../PushTokenProvider';

export class FakePushTokenProvider implements PushTokenProvider {
  getTokenCalls = 0;
  private readonly listeners = new Set<(token: string) => void>();

  constructor(public token: string | null = 'fcm-token-1') {}

  async getToken(): Promise<string | null> {
    this.getTokenCalls += 1;
    return this.token;
  }

  subscribe(listener: (token: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** SDK가 토큰을 갱신했다(onNewToken). */
  emit(token: string): void {
    this.token = token;
    [...this.listeners].forEach((listener) => listener(token));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
