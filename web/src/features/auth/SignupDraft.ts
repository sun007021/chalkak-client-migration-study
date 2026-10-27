import type { KakaoCredential } from './SocialLoginClient';

/** SIGN_UP_REQUIRED 뒤 가입이 끝나거나 취소될 때까지 idToken·rawNonce를 메모리에만 둔다(REQ-AUTH-004). 디스크 저장·로그 출력 금지. */
export class SignupDraft {
  private credential: KakaoCredential | null = null;
  set(credential: KakaoCredential): void {
    this.credential = { idToken: credential.idToken, rawNonce: credential.rawNonce };
  }
  get(): KakaoCredential | null {
    return this.credential;
  }
  clear(): void {
    this.credential = null;
  }
}
