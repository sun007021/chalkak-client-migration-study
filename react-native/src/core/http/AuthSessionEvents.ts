export type AuthSessionEvent = { type: 'session-expired' };
export type AuthSessionListener = (event: AuthSessionEvent) => void;

/** 세션이 지워져 로그인 화면으로 가야 할 때 발행하는 이벤트 버스. */
export class AuthSessionEvents {
  private readonly listeners = new Set<AuthSessionListener>();

  subscribe(listener: AuthSessionListener): () => void {
    const entry: AuthSessionListener = (event) => listener(event);
    this.listeners.add(entry);
    return () => this.listeners.delete(entry);
  }

  emit(event: AuthSessionEvent): void {
    [...this.listeners].forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[AuthSessionEvents] listener error', error);
      }
    });
  }
}
