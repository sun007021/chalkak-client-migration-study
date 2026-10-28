import { PAGE_SIZE } from '../../constants';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { path } from '../../core/net/url';
import { parseDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { AiReviewSummary, CalendarEntry, HomeTopic, PostSummary, TodayPost } from './homeModels';

/** 본문의 errorCode까지 읽은 404(서버가 만든 "없음")만 값으로 바꾼다. 게이트웨이 HTML 같은 본문 없는 404는 오류로 둔다. */
const isBusiness404 = (error: unknown): boolean => error instanceof ApiError && error.status === 404 && error.errorCode === 'BUSINESS_ERROR';

/** d.enumOf는 결과를 string으로 넓히므로 허용 값 타입을 직접 지정한다. */
const oneOf = <const T extends string>(values: readonly T[]): Decoder<T> => d.enumOf(values) as Decoder<T>;

const dateString = (): ((value: unknown) => DateString) => {
  const text = d.string();
  return (value) => {
    const s = text(value);
    try {
      parseDateString(s);
    } catch {
      throw new InvalidResponseError(`invalid date: ${s}`);
    }
    return s;
  };
};

const decodeTopic = d.object({
  id: d.string(),
  title: d.string(),
  topicDate: dateString(),
  phase: oneOf(['BEFORE_OPEN', 'OPEN', 'CLOSED']),
});

const decodePostList = d.object({
  posts: d.array(
    d.object({
      id: d.string(),
      authorId: d.string(),
      originalImageUrl: d.string(),
      thumbnailImageUrl: d.nullable(d.string()),
      title: d.nullable(d.string()),
      likeCount: d.number(),
      isLiked: d.boolean(),
      isMine: d.boolean(),
    }),
  ),
});

const decodeToday = d.object({
  topicDate: dateString(),
  isPosted: d.boolean(),
  postId: d.nullable(d.string()),
  moderationStatus: d.nullable(d.string()),
});

const decodeCalendar = d.object({
  posts: d.array(
    d.object({
      topicDate: dateString(),
      postId: d.string(),
      thumbnailImageUrl: d.nullable(d.string()),
      status: oneOf(['PENDING', 'APPROVED']),
    }),
  ),
});

const decodeUnread = d.object({ hasUnread: d.boolean() });

const decodeAiReview = d.object({
  status: oneOf(['NONE', 'PROCESSING', 'COMPLETED', 'FAILED']),
  canRequestAgain: d.nullable(d.boolean()),
});

const toAiSummary = (body: { status: AiReviewSummary['status']; canRequestAgain: boolean | null }): AiReviewSummary => ({
  status: body.status,
  canRequestAgain: body.canRequestAgain ?? false,
});

/**
 * 홈이 쓰는 읽기 API(API §1.3, §1.4, §1.5, §4.2). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError).
 * 404를 "없음"으로 바꾸는 곳만 값으로 돌려준다: fetchTopic(null), fetchPopularPosts([]), fetchAiReview(null), fetchTodayPost('no-open-topic').
 */
export class HomeRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /topics?date=. 404 → null. 400(미래 날짜)·그 밖은 던진다. 응답 topicDate가 요청 date와 다르면 InvalidResponseError. */
  async fetchTopic(date: DateString, signal?: AbortSignal): Promise<HomeTopic | null> {
    try {
      const topic = await this.deps.api.request({ method: 'GET', path: '/topics', query: { date }, signal }, decodeTopic);
      if (topic.topicDate !== date) throw new InvalidResponseError(`topicDate mismatch: ${topic.topicDate}`);
      return topic;
    } catch (error) {
      if (isBusiness404(error)) return null;
      throw error;
    }
  }

  /** GET /posts?topicDate=&sort=popular&page=1&pageSize=20(PAGE_SIZE). 서버 순서 그대로 전부 돌려준다(앞 5개 자르기는 ViewModel). 404 → []. */
  async fetchPopularPosts(topicDate: DateString, signal?: AbortSignal): Promise<PostSummary[]> {
    try {
      const body = await this.deps.api.request(
        { method: 'GET', path: '/posts', query: { topicDate, sort: 'popular', page: 1, pageSize: PAGE_SIZE }, signal },
        decodePostList,
      );
      return body.posts;
    } catch (error) {
      if (isBusiness404(error)) return [];
      throw error;
    }
  }

  /** GET /posts/today. 404 → no-open-topic, 403 → banned, isPosted=false(postId·moderationStatus null) → not-posted. 알 수 없는 상태 등 계약 위반은 InvalidResponseError. */
  async fetchTodayPost(signal?: AbortSignal): Promise<TodayPost> {
    let body;
    try {
      body = await this.deps.api.request({ method: 'GET', path: '/posts/today', signal }, decodeToday);
    } catch (error) {
      if (isBusiness404(error)) return { kind: 'no-open-topic' };
      if (error instanceof ApiError && error.status === 403 && error.errorCode === 'FORBIDDEN') return { kind: 'banned' };
      throw error;
    }
    if (!body.isPosted) {
      if (body.postId !== null || body.moderationStatus !== null) throw new InvalidResponseError('isPosted=false but post fields exist');
      return { kind: 'not-posted', topicDate: body.topicDate };
    }
    const { postId, moderationStatus } = body;
    if (postId === null || moderationStatus === null) throw new InvalidResponseError('isPosted=true but post fields are missing');
    if (moderationStatus !== 'VALIDATING' && moderationStatus !== 'PENDING' && moderationStatus !== 'APPROVED') {
      throw new InvalidResponseError(`unexpected moderationStatus: ${moderationStatus}`);
    }
    return { kind: 'posted', topicDate: body.topicDate, postId, moderationStatus };
  }

  /** GET /posts/calendar?year=&month=. */
  async fetchCalendar(year: number, month: number, signal?: AbortSignal): Promise<CalendarEntry[]> {
    const body = await this.deps.api.request({ method: 'GET', path: '/posts/calendar', query: { year, month }, signal }, decodeCalendar);
    return body.posts;
  }

  /** GET /notifications/unread-status → hasUnread. */
  async fetchUnreadStatus(signal?: AbortSignal): Promise<boolean> {
    const body = await this.deps.api.request({ method: 'GET', path: '/notifications/unread-status', signal }, decodeUnread);
    return body.hasUnread;
  }

  /** GET /posts/{postId}/ai-review. 404 → null. */
  async fetchAiReview(postId: string, signal?: AbortSignal): Promise<AiReviewSummary | null> {
    try {
      return toAiSummary(await this.deps.api.request({ method: 'GET', path: path`/posts/${postId}/ai-review`, signal }, decodeAiReview));
    } catch (error) {
      if (isBusiness404(error)) return null;
      throw error;
    }
  }

  /** POST /posts/{postId}/ai-review(본문 없음, 자동 재시도 없음). 202·200 모두 본문의 status를 돌려준다. */
  async requestAiReview(postId: string, signal?: AbortSignal): Promise<AiReviewSummary> {
    return toAiSummary(await this.deps.api.request({ method: 'POST', path: path`/posts/${postId}/ai-review`, signal }, decodeAiReview));
  }
}
