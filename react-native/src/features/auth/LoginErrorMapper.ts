/**
 * 로그인 중 발생한 오류를 사용자 문구로 바꾼다. 표시할 게 없으면(취소) null.
 * 401 -> kakao-account, 403 -> 서버 message(없으면 generic), 400·5xx·그 밖 -> generic,
 * 연결·타임아웃 -> network, 해석 불가 -> invalid-response, SocialLoginError config/failed -> config/kakao-failed.
 */
export function mapLoginError(_error: unknown): string | null {
  throw new Error('not implemented');
}
