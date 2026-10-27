/** 로그인 화면으로 돌려보내야 하는 이유. 라우터가 구독해 /login으로 replace 이동한다(REQ-NAV-022). */
export type SignedOutReason = 'expired' | 'logout' | 'withdrawn';

export class SessionEvents {
  private readonly listeners = new Set<(reason: SignedOutReason) => void>();

  subscribe(listener: (reason: SignedOutReason) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 구독자 하나가 던져도 나머지는 알림을 받는다. */
  emit(reason: SignedOutReason): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(reason);
      } catch {
        // 한 구독자의 오류가 다른 구독자를 막지 않는다.
      }
    }
  }
}
