/** 로그인 화면으로 돌려보내야 하는 이유. 라우터가 구독해 /login으로 replace 이동한다(REQ-NAV-022). */
export type SignedOutReason = 'expired' | 'logout' | 'withdrawn';

export class SessionEvents {
  subscribe(_listener: (reason: SignedOutReason) => void): () => void {
    throw new Error('not implemented');
  }
  emit(_reason: SignedOutReason): void {
    throw new Error('not implemented');
  }
}
