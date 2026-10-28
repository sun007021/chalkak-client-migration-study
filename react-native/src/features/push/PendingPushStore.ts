import type { PushData } from '../../core/push/NotificationResponseSource';

/** 보류 중인 푸시 탭 하나를 프로세스 종료를 넘어 보관한다(REQ-NAV-042). 새 탭은 이전 보류분을 교체한다. */
export interface PendingPushStore {
  load(): Promise<PushData | null>;
  /** null이면 지운다. */
  save(data: PushData | null): Promise<void>;
}
