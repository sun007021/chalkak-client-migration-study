import type { SessionStore } from '../../core/auth/SessionStore';
import type { PresignedUploader } from '../../core/net/PresignedUploader';
import type { Logger } from '../../core/net/Logger';
import type { SignatureRepository } from './SignatureRepository';
import type { SignatureSubmitter, SubmitOutcome } from './SignatureSubmitter';

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
export class ChangeSignatureService implements SignatureSubmitter {
  constructor(_deps: ChangeSignatureServiceDeps) {}

  submit(_png: Blob, _signal: AbortSignal): Promise<SubmitOutcome> {
    throw new Error('not implemented');
  }
}
