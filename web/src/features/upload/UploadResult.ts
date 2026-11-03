import type { DateString } from '../../core/time/kst';

/** 업로드가 끝난 뒤 성공 화면이 읽는 값. 메모리에만 두고 성공 화면을 벗어나거나 계정이 바뀌면 비운다. */
export interface UploadResult {
  topicDate: DateString;
  topicTitle: string;
  /** 201 응답 또는 복구 확인(GET /posts/today)의 상태. */
  moderationStatus: 'VALIDATING' | 'PENDING' | 'APPROVED';
  /** 방금 전시한 사진(성공 화면 카드). */
  photo: Blob;
}

/** 업로드 화면 → 성공 화면 사이의 값 보관(SignatureDraft와 같은 방식). 새로고침하면 사라지고 성공 화면은 홈으로 보낸다. */
export class UploadResultStore {
  private result: UploadResult | null = null;
  set(result: UploadResult): void {
    this.result = result;
  }
  get(): UploadResult | null {
    return this.result;
  }
  clear(): void {
    this.result = null;
  }
}
