import type { ApiClient } from '../../core/net/ApiClient';

export interface SignatureUploadTicket {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface CurrentSignature {
  originalUrl: string;
  thumbnailUrl: string | null;
  /** 썸네일이 있으면 썸네일, null이면 원본(D-18, REQ-SIGN-013). */
  displayUrl: string;
}

/** /users/me/signature 계열(API §1.2). 던지는 것은 ApiClient와 같다. */
export class SignatureRepository {
  constructor(_deps: { api: ApiClient }) {}

  /** GET /users/me/signature. 응답 필드: signatureOriginalImageUrl, signatureThumbnailImageUrl(null 가능). */
  fetchCurrent(_signal?: AbortSignal): Promise<CurrentSignature> {
    throw new Error('not implemented');
  }

  /** POST /users/me/signature/uploads(본문 없음). uploadId, uploadUrl, expiresInSeconds만 읽는다(contentType·maxBytes 없음). 멱등이라 D-21 재시도 대상. */
  requestUpload(_signal?: AbortSignal): Promise<SignatureUploadTicket> {
    throw new Error('not implemented');
  }

  /** PUT /users/me/signature {signatureOriginalUploadId}만. 응답 URL은 쓰지 않는다(D-18). */
  confirm(_uploadId: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
