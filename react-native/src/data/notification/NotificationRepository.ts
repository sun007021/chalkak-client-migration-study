import type { ApiClient } from '../../core/http/ApiClient';
import { asObject, bool } from '../decode';

export type NotificationRepositoryDeps = { api: ApiClient };

/** 알림 API. 이번 PR은 홈이 쓰는 미읽음 조회만 두고, 나머지는 알림 PR이 이 클래스에 추가한다. */
export class NotificationRepository {
  constructor(private readonly deps: NotificationRepositoryDeps) {}

  /** GET /notifications/unread-status → hasUnread. 실패는 ApiError를 그대로 던진다. */
  hasUnread(signal?: AbortSignal): Promise<boolean> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/notifications/unread-status', signal },
      (raw) => bool(asObject(raw, 'unread status'), 'hasUnread'),
    );
  }
}
