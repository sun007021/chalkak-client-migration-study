import type { ApiClient } from '../../core/http/ApiClient';

export type NotificationRepositoryDeps = { api: ApiClient };

/** 알림 API. 이번 PR은 홈이 쓰는 미읽음 조회만 두고, 나머지는 알림 PR이 이 클래스에 추가한다. */
export class NotificationRepository {
  constructor(private readonly deps: NotificationRepositoryDeps) {}

  /** GET /notifications/unread-status → hasUnread. 실패는 ApiError를 그대로 던진다. */
  hasUnread(_signal?: AbortSignal): Promise<boolean> {
    void this.deps;
    throw new Error('not implemented');
  }
}
