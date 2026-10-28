import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import type { Logger } from '../../core/net/Logger';
import type { Clock } from '../../core/time/Clock';
import type { AuthApi } from '../auth/AuthApi';
import type { SignupDraft } from '../auth/SignupDraft';
import type { SignatureSubmitter, SubmitOutcome } from '../signature/SignatureSubmitter';
import type { SignupRepository } from './SignupRepository';

export interface SignupServiceDeps {
  repository: SignupRepository;
  uploader: PresignedUploader;
  authApi: AuthApi;
  signupDraft: SignupDraft;
  store: SessionStore;
  userCaches: UserCaches;
  clock: Clock;
  logger?: Logger;
}

/**
 * 가입 한 번(REQ-ONB-013~026). submit마다 (1) 업로드 발급 → (2) presigned PUT(image/png) → (3) 가입 확정을 처음부터 한다.
 * 앞 단계가 실패하면 뒤 단계는 0건. 같은 idToken·rawNonce(SignupDraft)를 쓴다. 컨텍스트가 없으면 expired.
 *
 * (3)이 400 SIGNATURE_PROCESSING_PENDING이면 같은 signupToken으로 SIGNUP_PENDING_RETRY_INTERVAL_MS(1초) 뒤 다시: 최초 1회 + 재시도 최대 10회(총 11회).
 * 소진하면 timeout(마지막 응답 직후 추가 대기 없음). (1)·(2)는 다시 부르지 않는다. 대기는 clock.sleep.
 * 성공(200): SessionWriter로 저장(이전 사용자 캐시를 먼저 비움) + signupDraft.clear(). social-login 재호출 없음. 저장 직전 signal이 취소돼 있으면 저장하지 않고 cancelled.
 *
 * 분류: (1) 400 → 같은 idToken·rawNonce로 social-login 재호출, LOGIN_SUCCESS면 같은 방식으로 저장하고 succeeded, SIGN_UP_REQUIRED·그 밖의 실패는 generic(네트워크는 network).
 * (1)·(3) 401 → expired(signupDraft 폐기), 403 → forbidden(serverMessage), (3) 400 BUSINESS_ERROR → invalid(message로 구분하지 않는다, D-02), (3) 404 → reupload,
 * 네트워크·타임아웃 → network, 5xx·해석 불가·(2)의 PUT 오류 → generic. 취소 → cancelled. social-* POST는 재시도하지 않는다(D-21).
 */
export class SignupService implements SignatureSubmitter {
  constructor(_deps: SignupServiceDeps) {}

  submit(_png: Blob, _signal: AbortSignal): Promise<SubmitOutcome> {
    throw new Error('not implemented');
  }
}
