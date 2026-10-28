import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';

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

const decodeCurrent = d.object({ signatureOriginalImageUrl: d.string(), signatureThumbnailImageUrl: d.nullable(d.string()) });
const decodeTicket = d.object({ uploadId: d.string(), uploadUrl: d.string(), expiresInSeconds: d.number() });

/** /users/me/signature 계열(API §1.2). 던지는 것은 ApiClient와 같다. */
export class SignatureRepository {
  constructor(private readonly deps: { api: ApiClient }) {}

  /** GET /users/me/signature. 응답 필드: signatureOriginalImageUrl, signatureThumbnailImageUrl(null 가능). */
  fetchCurrent(signal?: AbortSignal): Promise<CurrentSignature> {
    return this.deps.api.request({ method: 'GET', path: '/users/me/signature', signal }, (json) => {
      const body = decodeCurrent(json);
      const thumbnailUrl = body.signatureThumbnailImageUrl;
      return { originalUrl: body.signatureOriginalImageUrl, thumbnailUrl, displayUrl: thumbnailUrl ?? body.signatureOriginalImageUrl };
    });
  }

  /** POST /users/me/signature/uploads(본문 없음). uploadId, uploadUrl, expiresInSeconds만 읽는다(contentType·maxBytes 없음). 멱등이라 D-21 재시도 대상. */
  requestUpload(signal?: AbortSignal): Promise<SignatureUploadTicket> {
    return this.deps.api.request({ method: 'POST', path: '/users/me/signature/uploads', signal }, decodeTicket);
  }

  /** PUT /users/me/signature {signatureOriginalUploadId}만. 응답 URL은 쓰지 않는다(D-18). */
  confirm(uploadId: string, signal?: AbortSignal): Promise<void> {
    return this.deps.api.requestVoid({ method: 'PUT', path: '/users/me/signature', body: { signatureOriginalUploadId: uploadId }, signal });
  }
}
