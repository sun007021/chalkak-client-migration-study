import type { Clock } from '../../core/time/Clock';
import type { BlobUrlFactory } from '../signature/BlobUrlFactory';

/** 저장이 사용자·환경에 의해 거절됐다(Web에서는 거의 없지만 포트 계약이다: 토스트 record.save.denied). */
export class SaveDeniedError extends Error {
  readonly name = 'SaveDeniedError';
}

/** 파일 하나를 사용자 기기에 내려받게 하는 포트. 다운로드를 시작시킨 시점에 이행한다. 거절은 SaveDeniedError, 그 밖의 실패는 일반 Error. */
export interface FileDownloader {
  download(file: { name: string; blob: Blob }): Promise<void>;
}

/** 클릭 뒤 blob URL을 해제하기까지의 유예. 브라우저가 다운로드를 시작(파일 읽기)하기 전에 해제하지 않게 한다. */
export const REVOKE_DELAY_MS = 10_000;

const DENIED_NAMES = ['SecurityError', 'NotAllowedError'];
const isDenied = (error: unknown): boolean => typeof error === 'object' && error !== null && DENIED_NAMES.includes((error as { name?: unknown }).name as string);

/** `<a download>` 구현: blob URL을 만들어 임시 앵커를 클릭하고 앵커를 DOM에서 빼며, URL은 유예 뒤(REVOKE_DELAY_MS) 해제한다. 클릭이 실패하면 곧바로 해제한다. 브라우저가 저장을 막으면(SecurityError·NotAllowedError) SaveDeniedError. */
export class AnchorFileDownloader implements FileDownloader {
  constructor(protected readonly deps: { blobUrls: BlobUrlFactory; clock: Clock; document?: Document }) {}

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
      // 시작된 다운로드가 URL을 읽을 시간을 준 뒤 해제한다(시계가 정한 유예).
      const revoke = () => this.deps.blobUrls.revoke(url);
      void this.deps.clock.sleep(REVOKE_DELAY_MS).then(revoke, revoke);
      return Promise.resolve();
    } catch (error) {
      this.deps.blobUrls.revoke(url);
      return Promise.reject(isDenied(error) ? new SaveDeniedError(error instanceof Error ? error.message : 'save denied') : error);
    } finally {
      anchor.remove();
    }
  }
}
