import type { ApiClient } from '../../core/http/ApiClient';
import type { KstDate } from '../../core/time/KstDate';
import { PAGE_SIZE } from '../../shared/constants';
import type { CalendarMonth, PostListPage, PostSort, TodayPost } from './PostModels';
import { decodeCalendarMonth, decodePostListPage, decodeTodayPost } from './postDecoders';

export type PostRepositoryDeps = { api: ApiClient };

export type ListPostsInput = {
  topicDate: KstDate;
  sort: PostSort;
  /** 기본 1 */
  page?: number;
  /** 기본 PAGE_SIZE(20) */
  pageSize?: number;
  signal?: AbortSignal;
};

/** 게시물 조회 API. 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 ViewModel). */
export class PostRepository {
  constructor(private readonly deps: PostRepositoryDeps) {}

  /** GET /posts?topicDate&sort&page&pageSize. sort는 소문자 그대로. 비로그인 허용(토큰이 있으면 붙인다). */
  list(input: ListPostsInput): Promise<PostListPage> {
    return this.deps.api.requestJson(
      {
        method: 'GET',
        path: '/posts',
        query: {
          topicDate: input.topicDate.toString(),
          sort: input.sort,
          page: input.page ?? 1,
          pageSize: input.pageSize ?? PAGE_SIZE,
        },
        signal: input.signal,
      },
      decodePostListPage,
    );
  }

  /** GET /posts/today (인증 필수). */
  getToday(signal?: AbortSignal): Promise<TodayPost> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/posts/today', signal },
      decodeTodayPost,
    );
  }

  /** GET /posts/calendar?year&month (인증 필수). */
  getCalendar(year: number, month: number, signal?: AbortSignal): Promise<CalendarMonth> {
    return this.deps.api.requestJson(
      { method: 'GET', path: '/posts/calendar', query: { year, month }, signal },
      decodeCalendarMonth,
    );
  }
}
