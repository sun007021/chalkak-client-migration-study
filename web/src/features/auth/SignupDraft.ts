import type { KakaoCredential } from './SocialLoginClient';

/** SIGN_UP_REQUIRED 뒤 가입이 끝나거나 취소될 때까지 idToken·rawNonce를 메모리에만 둔다(REQ-AUTH-004). 디스크 저장·로그 출력 금지. */
export class SignupDraft {
  set(_credential: KakaoCredential): void {
    throw new Error('not implemented');
  }
  get(): KakaoCredential | null {
    throw new Error('not implemented');
  }
  clear(): void {
    throw new Error('not implemented');
  }
}
