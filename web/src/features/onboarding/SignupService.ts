import { SIGNATURE_CONTENT_TYPE, SIGNUP_PENDING_RETRY_INTERVAL_MS, SIGNUP_PENDING_RETRY_MAX } from '../../constants';
import { SessionWriter } from '../../core/auth/SessionWriter';
import type { AuthTokens, SessionStore } from '../../core/auth/SessionStore';
import { ApiError, NetworkError, isCancellation } from '../../core/net/errors';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import type { Logger } from '../../core/net/Logger';
import type { Clock } from '../../core/time/Clock';
import type { AuthApi } from '../auth/AuthApi';
import type { SignupDraft } from '../auth/SignupDraft';
import type { KakaoCredential } from '../auth/SocialLoginClient';
import { classifyConfirmRejection } from '../signature/confirmFailure';
import type { SignatureFailure, SignatureSubmitter, SubmitOutcome } from '../signature/SignatureSubmitter';
import type { SignupRepository, SignupSession, SignupUploadTicket } from './SignupRepository';

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
type Stage = 'uploads' | 'put' | 'signup' | 'login';

const failed = (failure: SignatureFailure): SubmitOutcome => ({ kind: 'failed', failure });
const CANCELLED: SubmitOutcome = { kind: 'cancelled' };

export class SignupService implements SignatureSubmitter {
  private readonly writer: SessionWriter;

  constructor(private readonly deps: SignupServiceDeps) {
    this.writer = new SessionWriter({ store: deps.store, userCaches: deps.userCaches });
  }

  async submit(png: Blob, signal: AbortSignal): Promise<SubmitOutcome> {
    const { repository, uploader, signupDraft } = this.deps;
    if (signal.aborted) return CANCELLED;
    const credential = signupDraft.get();
    if (!credential) return failed({ kind: 'expired' });

    let stage: Stage = 'uploads';
    try {
      let ticket: SignupUploadTicket;
      try {
        ticket = await repository.requestUpload(credential, signal);
      } catch (error) {
        // 이미 가입된 계정(400)이면 같은 자격으로 로그인한다.
        if (error instanceof ApiError && error.status === 400) return await this.loginInstead(credential, signal);
        throw error;
      }
      stage = 'put';
      await uploader.put({ url: ticket.uploadUrl, body: png, contentType: SIGNATURE_CONTENT_TYPE, signal });
      stage = 'signup';
      const session = await this.confirm(ticket.signupToken, signal);
      return await this.save(session.userId, session.tokens, signal);
    } catch (error) {
      return this.classify(error, stage);
    }
  }

  /** 확정. PENDING이면 같은 signupToken으로 1초 간격, 최초 1회 + 재시도 최대 10회. */
  private async confirm(signupToken: string, signal: AbortSignal): Promise<SignupSession> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.deps.repository.signUp(signupToken, signal);
      } catch (error) {
        const pending = error instanceof ApiError && error.status === 400 && error.errorCode === 'SIGNATURE_PROCESSING_PENDING';
        if (!pending) throw error;
        if (attempt >= SIGNUP_PENDING_RETRY_MAX) throw new PendingExhaustedError();
        await this.deps.clock.sleep(SIGNUP_PENDING_RETRY_INTERVAL_MS, signal);
      }
    }
  }

  private async loginInstead(credential: KakaoCredential, signal: AbortSignal): Promise<SubmitOutcome> {
    try {
      const result = await this.deps.authApi.socialLogin(credential, signal);
      if (result.kind !== 'login_success') return failed({ kind: 'generic' });
      return await this.save(result.userId, result.tokens, signal);
    } catch (error) {
      return this.classify(error, 'login');
    }
  }

  private async save(userId: string, tokens: AuthTokens, signal: AbortSignal): Promise<SubmitOutcome> {
    if (signal.aborted) return CANCELLED;
    await this.writer.replace({ userId, tokens, isGuest: false });
    this.deps.signupDraft.clear();
    return { kind: 'succeeded' };
  }

  private classify(error: unknown, stage: Stage): SubmitOutcome {
    if (isCancellation(error)) return CANCELLED;
    if (error instanceof PendingExhaustedError) return failed({ kind: 'timeout' });
    if (error instanceof NetworkError) return failed({ kind: 'network' });
    if (error instanceof ApiError) {
      if (stage === 'put') return failed({ kind: 'generic' });
      if (error.status === 403) return failed(error.message ? { kind: 'forbidden', serverMessage: error.message } : { kind: 'forbidden' });
      if (stage !== 'login') {
        if (error.status === 401) {
          this.deps.signupDraft.clear();
          return failed({ kind: 'expired' });
        }
        const rejection = stage === 'signup' ? classifyConfirmRejection(error, 'reupload') : null;
        if (rejection) return failed(rejection);
      }
    }
    this.deps.logger?.log('warn', 'signup failed', { stage, error });
    return failed({ kind: 'generic' });
  }
}

class PendingExhaustedError extends Error {}
