/** 카카오 인증 결과. rawNonce는 서버에 보내는 원문이고, SDK에는 SHA-256(rawNonce) hex를 보냈다. */
export interface KakaoCredential {
  idToken: string;
  rawNonce: string;
}

export interface SocialLoginClient {
  /**
   * 카카오 인증을 시작해 idToken과 그 시도의 rawNonce를 돌려준다. 호출마다 새 rawNonce를 쓴다(REQ-AUTH-002).
   * 던지는 것: SocialLoginCancelledError(사용자 취소), SocialLoginConfigError(idToken 없음·설정 오류), 그 밖은 SocialLoginFailedError(또는 알 수 없는 Error).
   * Web 리다이렉트 구현은 페이지를 떠나므로 이 Promise가 끝나지 않을 수 있다.
   */
  login(signal?: AbortSignal): Promise<KakaoCredential>;
}

/** 리다이렉트로 돌아온 URL에서 인증 결과를 복원한다(콜백 라우트). */
export type ResumeKakaoRedirect = (callbackUrl: string, signal?: AbortSignal) => Promise<KakaoCredential>;

export class SocialLoginCancelledError extends Error {
  readonly name = 'SocialLoginCancelledError';
}
export class SocialLoginConfigError extends Error {
  readonly name = 'SocialLoginConfigError';
}
export class SocialLoginFailedError extends Error {
  readonly name = 'SocialLoginFailedError';
}
/** 보관된 로그인 시도가 없다(새로고침, 뒤로 가기, 이미 쓴 콜백, SSO 재진입). 오류 문구를 보이지 않고 세션 유무로 이동한다. */
export class SocialLoginNoPendingError extends Error {
  readonly name = 'SocialLoginNoPendingError';
}
