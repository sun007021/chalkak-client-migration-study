import type { ApiClient } from '../../core/http/ApiClient';
import { HttpError } from '../../core/http/ApiError';
import { SIGNATURE_CONTENT_TYPE } from '../../shared/constants';

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
  async getCurrent(signal?: AbortSignal): Promise<CurrentSignature | null> {
    try {
      return await this.deps.api.requestJson(
        { method: 'GET', path: '/users/me/signature', signal },
        decodeCurrent,
      );
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status === 400 &&
        error.errorCode === 'SIGNATURE_REGISTRATION_REQUIRED'
      ) {
        return null;
      }
      throw error;
    }
  }

  /** POST /users/me/signature/uploads (본문 없음, 자동 재시도 대상). contentType·maxBytes는 응답에 없다. */
  requestUpload(signal?: AbortSignal): Promise<SignatureUploadTicket> {
    return this.deps.api.requestJson(
      { method: 'POST', path: '/users/me/signature/uploads', signal },
      decodeTicket,
    );
  }

  /** presigned PUT. SIGNATURE_CONTENT_TYPE, 인증 헤더 없음. */
  uploadPng(url: string, png: Uint8Array, signal?: AbortSignal): Promise<void> {
    return this.deps.api.uploadToPresignedUrl({
      url,
      contentType: SIGNATURE_CONTENT_TYPE,
      body: png,
      signal,
    });
  }

  /** PUT /users/me/signature {signatureOriginalUploadId}. 응답의 URL은 쓰지 않는다(D-18). */
  async confirmChange(uploadId: string, signal?: AbortSignal): Promise<void> {
    await this.deps.api.requestVoid({
      method: 'PUT',
      path: '/users/me/signature',
      body: { signatureOriginalUploadId: uploadId },
      signal,
    });
  }
}

function decodeTicket(raw: unknown): SignatureUploadTicket {
  const { uploadId, uploadUrl, expiresInSeconds } = asRecord(raw);
  if (!isNonEmptyString(uploadId) || !isNonEmptyString(uploadUrl)) {
    throw new Error('missing upload ticket fields');
  }
  if (typeof expiresInSeconds !== 'number') throw new Error('missing expiresInSeconds');
  return { uploadId, uploadUrl, expiresInSeconds };
}

function decodeCurrent(raw: unknown): CurrentSignature {
  const { signatureThumbnailImageUrl, signatureOriginalImageUrl } = asRecord(raw);
  if (isNonEmptyString(signatureThumbnailImageUrl)) return { imageUrl: signatureThumbnailImageUrl };
  if (isNonEmptyString(signatureOriginalImageUrl)) return { imageUrl: signatureOriginalImageUrl };
  throw new Error('missing signature image url');
}

const asRecord = (raw: unknown): Record<string, unknown> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not object');
  return raw as Record<string, unknown>;
};
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';
