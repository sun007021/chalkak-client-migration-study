export type AuthSessionEvent = { type: 'session-expired' };
export type AuthSessionListener = (event: AuthSessionEvent) => void;

/** 세션이 지워져 로그인 화면으로 가야 할 때 발행하는 이벤트 버스. */
export class AuthSessionEvents {
  subscribe(_listener: AuthSessionListener): () => void {
    throw new Error('not implemented');
  }

  emit(_event: AuthSessionEvent): void {
    throw new Error('not implemented');
  }
}
