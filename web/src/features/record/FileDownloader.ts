import type { BlobUrlFactory } from '../signature/BlobUrlFactory';

const NOT_IMPLEMENTED = 'not implemented';

/** 저장이 사용자·환경에 의해 거절됐다(Web에서는 거의 없지만 포트 계약이다: 토스트 record.save.denied). */
export class SaveDeniedError extends Error {
  readonly name = 'SaveDeniedError';
}

/** 파일 하나를 사용자 기기에 내려받게 하는 포트. 다운로드를 시작시킨 시점에 이행한다. 거절은 SaveDeniedError, 그 밖의 실패는 일반 Error. */
export interface FileDownloader {
  download(file: { name: string; blob: Blob }): Promise<void>;
}

/** `<a download>` 구현: blob URL을 만들어 임시 앵커를 클릭하고 앵커를 DOM에서 빼며 URL을 해제한다. */
export class AnchorFileDownloader implements FileDownloader {
  constructor(protected readonly deps: { blobUrls: BlobUrlFactory; document?: Document }) {}

  download(_file: { name: string; blob: Blob }): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
