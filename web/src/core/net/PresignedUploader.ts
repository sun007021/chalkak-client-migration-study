import { UPLOAD_PUT_TIMEOUT_MS } from '../../constants';
import { assertAllowedAbsoluteUrl } from '../config/apiBaseUrl';
import type { Clock } from '../time/Clock';
import { ApiError } from './errors';
import { HttpTransport } from './HttpTransport';
import { sanitizeLogFields, stripUrlQuery } from './Logger';
import type { Logger } from './Logger';

export interface PresignedUploaderDeps {
  fetch: typeof fetch;
  clock: Clock;
  logger?: Logger;
}

export interface PresignedPutRequest {
  /** 서버가 준 presigned URL(쿼리 포함). 로그에는 쿼리를 남기지 않는다. */
  url: string;
  body: Blob | ArrayBuffer;
  /** 정책이 준 Content-Type(사진 image/webp, 사인 image/png). */
  contentType: string;
  signal?: AbortSignal;
}

/** presigned PUT: 타임아웃 60초, Authorization·Accept 등 앱 공통 헤더 없이 Content-Type만. 비 2xx는 ApiError(status, null). */
export class PresignedUploader {
  private readonly transport: HttpTransport;

  constructor(private readonly deps: PresignedUploaderDeps) {
    this.transport = new HttpTransport(deps);
  }

  async put(request: PresignedPutRequest): Promise<void> {
    assertAllowedAbsoluteUrl(request.url);
    const response = await this.transport.send({
      method: 'PUT',
      url: request.url,
      headers: { 'content-type': request.contentType },
      body: request.body,
      timeoutMs: UPLOAD_PUT_TIMEOUT_MS,
      retry: false,
      signal: request.signal,
    });
    if (response.status >= 200 && response.status < 300) return;
    this.deps.logger?.log('warn', 'presigned upload failed', sanitizeLogFields({ url: stripUrlQuery(request.url), status: response.status }) as Record<string, unknown>);
    throw new ApiError(response.status, null, 'presigned upload failed');
  }
}
