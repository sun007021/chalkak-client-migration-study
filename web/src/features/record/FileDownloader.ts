import type { BlobUrlFactory } from '../signature/BlobUrlFactory';

/** 저장이 사용자·환경에 의해 거절됐다(Web에서는 거의 없지만 포트 계약이다: 토스트 record.save.denied). */
export class SaveDeniedError extends Error {
  readonly name = 'SaveDeniedError';
}

/** 파일 하나를 사용자 기기에 내려받게 하는 포트. 다운로드를 시작시킨 시점에 이행한다. 거절은 SaveDeniedError, 그 밖의 실패는 일반 Error. */
export interface FileDownloader {
  download(file: { name: string; blob: Blob }): Promise<void>;
}

const DENIED_NAMES = ['SecurityError', 'NotAllowedError'];
const isDenied = (error: unknown): boolean => typeof error === 'object' && error !== null && DENIED_NAMES.includes((error as { name?: unknown }).name as string);

/** `<a download>` 구현: blob URL을 만들어 임시 앵커를 클릭하고 앵커를 DOM에서 빼며 URL을 해제한다. 브라우저가 저장을 막으면(SecurityError·NotAllowedError) SaveDeniedError. */
export class AnchorFileDownloader implements FileDownloader {
  constructor(protected readonly deps: { blobUrls: BlobUrlFactory; document?: Document }) {}

  download(file: { name: string; blob: Blob }): Promise<void> {
    const doc = this.deps.document ?? document;
    const url = this.deps.blobUrls.create(file.blob);
    const anchor = doc.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.style.display = 'none';
    try {
      doc.body.appendChild(anchor);
      anchor.click();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(isDenied(error) ? new SaveDeniedError(error instanceof Error ? error.message : 'save denied') : error);
    } finally {
      anchor.remove();
      this.deps.blobUrls.revoke(url);
    }
  }
}
