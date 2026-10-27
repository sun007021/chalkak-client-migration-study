import type { ApiClient } from '../../core/http/ApiClient';

export type SignatureUploadTicket = {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
};

/** 설정 사인 카드에 쓸 이미지. 썸네일이 있으면 썸네일, 없으면 원본(REQ-SIGN-013). */
export type CurrentSignature = { imageUrl: string };

export type SignatureRepositoryDeps = { api: ApiClient };

/** 사인 조회·변경 API. 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 mapSignatureError). */
export class SignatureRepository {
  constructor(private readonly deps: SignatureRepositoryDeps) {}

  /** GET /users/me/signature. 400 SIGNATURE_REGISTRATION_REQUIRED면 null(사인 없음, 변경 유도). */
  async getCurrent(_signal?: AbortSignal): Promise<CurrentSignature | null> {
    throw new Error('not implemented');
  }

  /** POST /users/me/signature/uploads (본문 없음, 자동 재시도 대상). contentType·maxBytes는 응답에 없다. */
  async requestUpload(_signal?: AbortSignal): Promise<SignatureUploadTicket> {
    throw new Error('not implemented');
  }

  /** presigned PUT. SIGNATURE_CONTENT_TYPE, 인증 헤더 없음. */
  async uploadPng(_url: string, _png: Uint8Array, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }

  /** PUT /users/me/signature {signatureOriginalUploadId}. 응답의 URL은 쓰지 않는다(D-18). */
  async confirmChange(_uploadId: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
