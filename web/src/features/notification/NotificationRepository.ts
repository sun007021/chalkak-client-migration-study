import type { ApiClient } from '../../core/net/ApiClient';
import type { NotificationDetail, NotificationsPage } from './notificationModels';

/**
 * 알림함 API(API §1.5, §4.3). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError).
 * 세 호출 모두 멱등이라 D-21 자동 재시도(0.5초·1초, 최대 2회)를 탄다. 경로의 id는 소문자로 보낸다.
 *
 * - fetchPage(page): `GET /notifications?page=&pageSize=20`. page는 1 이상의 정수가 아니면 요청 없이 RangeError.
 *   항목의 id·type·title·body·createdAt 중 하나라도 없거나 타입이 틀리면, createdAt이 UTC Instant가 아니면 응답 전체가 InvalidResponseError.
 *   sourceType·sourceId·thumbnailImageUrl·readAt은 null 또는 생략을 null로 읽는다. 알 수 없는 type·모르는 키는 그대로 통과한다. 날짜로 거르지 않는다(N1).
 * - fetchDetail(id): `GET /notifications/{id}`. 404 BUSINESS_ERROR(본문의 errorCode까지 읽은 것)만 null. 본문 없는 404(게이트웨이)나 그 밖의 오류는 던진다.
 *   originalImageUrl·rejectionReason·readAt은 null 또는 생략을 null로 읽는다.
 * - markRead(id): `PATCH /notifications/{id}/read`, 본문 없음, 204. 404·5xx 등은 ApiError로 던진다(분기는 ViewModel).
 */
export class NotificationRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  fetchPage(_page: number, _signal?: AbortSignal): Promise<NotificationsPage> {
    throw new Error('not implemented');
  }

  fetchDetail(_id: string, _signal?: AbortSignal): Promise<NotificationDetail | null> {
    throw new Error('not implemented');
  }

  markRead(_id: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
