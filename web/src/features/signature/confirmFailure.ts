import { ApiError } from '../../core/net/errors';
import type { SignatureFailure } from './SignatureSubmitter';

/**
 * 사인 확정 단계(가입 `POST /auth/social-signup`, 변경 `PUT /users/me/signature`)의 400·404 공통 분류.
 * - 404(업로드 없음): notFound로 지정한 종류(가입 reupload, 변경 not_found).
 * - 400 SIGNATURE_REUPLOAD_REQUIRED: reupload.
 * - 그 밖의 400: invalid. errorCode가 알려진 코드가 아니면 ApiClient가 BUSINESS_ERROR로 정규화하므로(api-contract §5.1, D-02) message로 가르지 않고 모두 invalid다.
 *   본문에 errorCode가 없는 400(게이트웨이 HTML 등)은 서버 판정이 아니라서 여기서 분류하지 않는다(null → 호출부가 generic).
 * 그 밖의 상태는 null.
 */
export function classifyConfirmRejection(error: unknown, notFound: 'reupload' | 'not_found'): SignatureFailure | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return { kind: notFound };
  if (error.status !== 400 || error.errorCode === null) return null;
  return error.errorCode === 'SIGNATURE_REUPLOAD_REQUIRED' ? { kind: 'reupload' } : { kind: 'invalid' };
}
