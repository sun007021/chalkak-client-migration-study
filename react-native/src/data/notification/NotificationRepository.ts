import type { ApiClient } from '../../core/http/ApiClient';
import { PAGE_SIZE } from '../../shared/constants';
import { asObject, bool } from '../decode';
import {
  decodeNotificationDetail,
  decodeNotificationPage,
  type NotificationDetail,
  type NotificationPage,
} from './NotificationModels';

export type NotificationRepositoryDeps = { api: ApiClient };

/** 알림 API. 실패는 ApiError 하위 클래스를 그대로 던진다. 모두 읽음(read-all)은 UI가 없어 부르지 않는다(REQ-NOTI-013). */
export class NotificationRepository {
  constructor(private readonly deps: NotificationRepositoryDeps) {}

  /** GET /notifications/unread-status → hasUnread. 실패는 ApiError를 그대로 던진다. */
  hasUnread(signal?: AbortSignal): Promise<boolean> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/notifications/unread-status', signal },
      (raw) => bool(asObject(raw, 'unread status'), 'hasUnread'),
    );
  }

  /** GET /notifications?page&pageSize=20 (최신순). */
  list(page: number, signal?: AbortSignal): Promise<NotificationPage> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/notifications', query: { page, pageSize: PAGE_SIZE }, signal },
      decodeNotificationPage,
    );
  }

  /** GET /notifications/{id}. 조회만으로는 읽음 처리되지 않는다. */
  getDetail(id: string, signal?: AbortSignal): Promise<NotificationDetail> {
    return this.deps.api.requestJson(
      { method: 'GET', path: `/notifications/${id}`, signal },
      decodeNotificationDetail,
    );
  }

  /** PATCH /notifications/{id}/read (204). 이미 읽은 알림도 서버가 멱등으로 받는다. */
  markRead(id: string, signal?: AbortSignal): Promise<void> {
    return this.deps.api.requestVoid({
      method: 'PATCH',
      path: `/notifications/${id}/read`,
      signal,
    });
  }
}
