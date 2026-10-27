import { SocialLoginError } from '../../core/auth/SocialLoginClient';
import {
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';

/**
 * 로그인 중 발생한 오류를 사용자 문구로 바꾼다. 표시할 게 없으면(취소) null.
 * 401 -> kakao-account, 403 -> 서버 message(없으면 generic), 400·5xx·그 밖 -> generic,
 * 연결·타임아웃 -> network, 해석 불가 -> invalid-response, SocialLoginError config/failed -> config/kakao-failed.
 */
export function mapLoginError(error: unknown): string | null {
  if (error instanceof CancelledError) return null;
  if (error instanceof SocialLoginError) {
    return t(
      error.reason === 'config' ? 'auth.login.error.config' : 'auth.login.error.kakao-failed',
    );
  }
  if (error instanceof NetworkError) return t('auth.login.error.network');
  if (error instanceof InvalidResponseError) return t('auth.login.error.invalid-response');
  if (error instanceof HttpError) {
    if (error.status === 401) return t('auth.login.error.kakao-account');
    // 서버 message는 차단 사유 안내인 403에서만 그대로 보여 준다. 그 밖은 내부 문구가 새지 않게 일반 문구.
    if (error.status === 403 && error.serverMessage) return error.serverMessage;
  }
  return t('auth.login.error.generic');
}
