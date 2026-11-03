import type { PendingPushStore } from '../PendingPushStore';
import type { PushData } from '../../../core/push/NotificationResponseSource';

/** 프로세스 종료를 넘어 남는 저장소의 메모리 대역. */
export class FakePendingPushStore implements PendingPushStore {
  saved: PushData | null = null;
  saveCalls = 0;

  async load(): Promise<PushData | null> {
    return this.saved;
  }

  async save(data: PushData | null): Promise<void> {
    this.saveCalls += 1;
    this.saved = data;
  }
}
