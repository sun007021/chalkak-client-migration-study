import { PAGE_SIZE } from '../../constants';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { ApiError } from '../../core/net/errors';
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
const decodePage = d.object({
  currentPage: d.number(),
  pageSize: d.number(),
  hasNext: d.boolean(),
  notifications: d.array(
    d.object({
      id: d.string(),
      type: d.string(),
      sourceType: d.nullable(d.string()),
      sourceId: d.nullable(d.string()),
      title: d.string(),
      body: d.string(),
      thumbnailImageUrl: d.nullable(d.string()),
      readAt: d.nullable(d.instant()),
      createdAt: d.instant(),
    }),
  ),
});

const decodeDetail = d.object({
  id: d.string(),
  type: d.string(),
  title: d.string(),
  body: d.string(),
  originalImageUrl: d.nullable(d.string()),
  rejectionReason: d.nullable(d.string()),
  readAt: d.nullable(d.instant()),
  createdAt: d.instant(),
});

export class NotificationRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  async fetchPage(page: number, signal?: AbortSignal): Promise<NotificationsPage> {
    if (!Number.isInteger(page) || page < 1) throw new RangeError(`page must be a positive integer: ${page}`);
    return this.deps.api.request({ method: 'GET', path: '/notifications', query: { page, pageSize: PAGE_SIZE }, signal }, decodePage);
  }

  async fetchDetail(id: string, signal?: AbortSignal): Promise<NotificationDetail | null> {
    try {
      return await this.deps.api.request({ method: 'GET', path: `/notifications/${encodeURIComponent(id.toLowerCase())}`, signal }, decodeDetail);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.errorCode === 'BUSINESS_ERROR') return null;
      throw error;
    }
  }

  async markRead(id: string, signal?: AbortSignal): Promise<void> {
    await this.deps.api.requestVoid({ method: 'PATCH', path: `/notifications/${encodeURIComponent(id.toLowerCase())}/read`, signal });
  }
}
