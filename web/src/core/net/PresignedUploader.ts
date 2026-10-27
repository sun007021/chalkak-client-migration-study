import type { Clock } from '../time/Clock';
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
  constructor(_deps: PresignedUploaderDeps) {}
  put(_request: PresignedPutRequest): Promise<void> {
    throw new Error('not implemented');
  }
}
