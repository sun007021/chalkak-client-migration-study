import { SIGNATURE_CONTENT_TYPE } from '../../constants';
import type { SessionStore } from '../../core/auth/SessionStore';
import { ApiError, NetworkError, SessionChangedError, isCancellation } from '../../core/net/errors';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import type { Logger } from '../../core/net/Logger';
import { classifyConfirmRejection } from './confirmFailure';
import type { SignatureRepository } from './SignatureRepository';
import type { SignatureFailure, SignatureSubmitter, SubmitOutcome } from './SignatureSubmitter';

export interface ChangeSignatureServiceDeps {
  repository: SignatureRepository;
  uploader: PresignedUploader;
  store: SessionStore;
  logger?: Logger;
}

/**
 * 설정의 사인 변경(REQ-SIGN-020~029). submit마다 POST /users/me/signature/uploads → presigned PUT(image/png) → PUT /users/me/signature를 처음부터 한다(uploadId 재사용 없음).
 * 앞 단계가 실패하면 뒤 단계는 0건.
 *
 * 분류(단계 인식): 발급·확정의 403 → forbidden, 401(갱신 후에도) → expired, 확정 400 SIGNATURE_REUPLOAD_REQUIRED → reupload, 확정 400 그 밖 → invalid,
 * 확정 404 → not_found, 네트워크·타임아웃 → network, 그 밖 → generic. PUT(S3) 단계: 네트워크 → network, 그 밖(403 포함) → generic. 취소 → cancelled.
 * 시작할 때의 userId와 끝났을 때의 userId가 다르면(로그아웃·계정 전환) 결과를 버린다(cancelled, TC-SIGN-038). 단 expired는 세션이 지워진 것이 원인이라 그대로 돌려준다.
 */
type Stage = 'uploads' | 'put' | 'confirm';

const failed = (failure: SignatureFailure): SubmitOutcome => ({ kind: 'failed', failure });
const CANCELLED: SubmitOutcome = { kind: 'cancelled' };

export class ChangeSignatureService implements SignatureSubmitter {
  constructor(private readonly deps: ChangeSignatureServiceDeps) {}

  async submit(png: Blob, signal: AbortSignal): Promise<SubmitOutcome> {
    const { repository, uploader, store } = this.deps;
    if (signal.aborted) return CANCELLED;
    let stage: Stage = 'uploads';
    let outcome: SubmitOutcome;
    let startedAs: string | null = null;
    try {
      startedAs = (await store.read()).userId;
      const ticket = await repository.requestUpload(signal);
      stage = 'put';
      await uploader.put({ url: ticket.uploadUrl, body: png, contentType: SIGNATURE_CONTENT_TYPE, signal });
      stage = 'confirm';
      await repository.confirm(ticket.uploadId, signal);
      outcome = { kind: 'succeeded' };
    } catch (error) {
      outcome = this.classify(error, stage);
    }
    if (outcome.kind === 'failed' && outcome.failure.kind === 'expired') return outcome;
    if (outcome.kind === 'cancelled' || signal.aborted) return CANCELLED;
    // 로그아웃·계정 전환으로 사용자가 바뀌었으면 결과를 버린다(TC-SIGN-038).
    try {
      if ((await store.read()).userId !== startedAs) return CANCELLED;
    } catch {
      return failed({ kind: 'generic' });
    }
    return outcome;
  }

  private classify(error: unknown, stage: Stage): SubmitOutcome {
    if (isCancellation(error) || error instanceof SessionChangedError) return CANCELLED;
    if (error instanceof NetworkError) return failed({ kind: 'network' });
    if (error instanceof ApiError && stage !== 'put') {
      if (error.status === 401) return failed({ kind: 'expired' });
      if (error.status === 403) return failed({ kind: 'forbidden' });
      const rejection = stage === 'confirm' ? classifyConfirmRejection(error, 'not_found') : null;
      if (rejection) return failed(rejection);
    }
    this.deps.logger?.log('warn', 'signature change failed', { stage, error });
    return failed({ kind: 'generic' });
  }
}
