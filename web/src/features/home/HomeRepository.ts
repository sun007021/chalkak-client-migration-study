import type { ApiClient } from '../../core/net/ApiClient';
import type { DateString } from '../../core/time/kst';
import type { AiReviewSummary, CalendarEntry, HomeTopic, PostSummary, TodayPost } from './homeModels';

/**
 * 홈이 쓰는 읽기 API(API §1.3, §1.4, §1.5, §4.2). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError).
 * 404를 "없음"으로 바꾸는 곳만 값으로 돌려준다: fetchTopic(null), fetchPopularPosts([]), fetchAiReview(null), fetchTodayPost('no-open-topic').
 */
export class HomeRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /topics?date=. 404 → null. 400(미래 날짜)·그 밖은 던진다. 응답 topicDate가 요청 date와 다르면 InvalidResponseError. */
  fetchTopic(_date: DateString, _signal?: AbortSignal): Promise<HomeTopic | null> {
    throw new Error('not implemented');
  }

  /** GET /posts?topicDate=&sort=popular&page=1&pageSize=20(PAGE_SIZE). 서버 순서 그대로 전부 돌려준다(앞 5개 자르기는 ViewModel). 404 → []. */
  fetchPopularPosts(_topicDate: DateString, _signal?: AbortSignal): Promise<PostSummary[]> {
    throw new Error('not implemented');
  }

  /** GET /posts/today. 404 → no-open-topic, 403 → banned, isPosted=false(postId·moderationStatus null) → not-posted. 알 수 없는 상태 등 계약 위반은 InvalidResponseError. */
  fetchTodayPost(_signal?: AbortSignal): Promise<TodayPost> {
    throw new Error('not implemented');
  }

  /** GET /posts/calendar?year=&month=. */
  fetchCalendar(_year: number, _month: number, _signal?: AbortSignal): Promise<CalendarEntry[]> {
    throw new Error('not implemented');
  }

  /** GET /notifications/unread-status → hasUnread. */
  fetchUnreadStatus(_signal?: AbortSignal): Promise<boolean> {
    throw new Error('not implemented');
  }

  /** GET /posts/{postId}/ai-review. 404 → null. */
  fetchAiReview(_postId: string, _signal?: AbortSignal): Promise<AiReviewSummary | null> {
    throw new Error('not implemented');
  }

  /** POST /posts/{postId}/ai-review(본문 없음, 자동 재시도 없음). 202·200 모두 본문의 status를 돌려준다. */
  requestAiReview(_postId: string, _signal?: AbortSignal): Promise<AiReviewSummary> {
    throw new Error('not implemented');
  }
}
