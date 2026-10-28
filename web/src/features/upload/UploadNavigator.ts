import type { DateString } from '../../core/time/kst';

/** 업로드 게이트가 화면을 바꾸는 유일한 통로. */
export interface UploadNavigator {
  /** 업로드 화면을 연다. topicDate는 게이트가 받은 `GET /posts/today`의 값이며 화면이 닫힐 때까지 고정된다(REQ-UPL-008). */
  openUpload(target: { topicDate: DateString }): void;
}

/** 컨테이너가 하나 보관하고 라우트 루트가 마운트되는 동안 실제 구현(RouterUploadNavigator)을 꽂는다. 붙어 있지 않으면 요청을 버린다. */
export class AttachableUploadNavigator implements UploadNavigator {
  private target: UploadNavigator | null = null;

  attach(target: UploadNavigator): () => void {
    this.target = target;
    return () => {
      if (this.target === target) this.target = null;
    };
  }

  openUpload(target: { topicDate: DateString }): void {
    this.target?.openUpload(target);
  }
}
