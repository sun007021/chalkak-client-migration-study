import { UPLOAD_PUT_TIMEOUT_MS } from '../../constants';
import { assertAllowedAbsoluteUrl } from '../config/apiBaseUrl';
import type { Clock } from '../time/Clock';
import { ApiError } from './errors';
import { HttpTransport } from './HttpTransport';
import { sanitizeLogFields, stripUrlQuery } from './Logger';
import type { Logger } from './Logger';
import type { UploadUrlRewriter } from './UploadUrlRewriter';

export interface PresignedUploaderDeps {
  fetch: typeof fetch;
  clock: Clock;
  logger?: Logger;
  /** 전송 직전에 주소를 바꾼다(개발 프록시). 없으면 그대로. 허용 검사와 로그는 원래 주소 기준. */
  urlRewriter?: UploadUrlRewriter;
}

export interface PresignedPutRequest {
  /** 서버가 준 presigned URL(쿼리 포함). 로그에는 쿼리를 남기지 않는다. */
  url: string;
  body: Blob | ArrayBuffer;
  /** 정책이 준 Content-Type(사진 image/webp, 사인 image/png). */
  contentType: string;
  signal?: AbortSignal;
  /**
   * true면 네트워크 오류·5xx에 0.5s, 1s 백오프로 최대 2회 자동 재시도한다(D-21: PUT은 멱등, 사진 업로드 TC-UPL-055). 4xx는 재시도하지 않는다.
   * 기본 false(사인 업로드는 기존 동작 그대로).
   */
  retry?: boolean;
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
      url: this.deps.urlRewriter ? this.deps.urlRewriter.rewrite(request.url) : request.url,
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
