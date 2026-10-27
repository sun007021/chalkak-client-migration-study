import type { ApiClient } from '../../core/http/ApiClient';
import type { KstDate } from '../../core/time/KstDate';
import type { CalendarMonth, PostListPage, PostSort, TodayPost } from './PostModels';

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
  list(_input: ListPostsInput): Promise<PostListPage> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** GET /posts/today (인증 필수). */
  getToday(_signal?: AbortSignal): Promise<TodayPost> {
    throw new Error('not implemented');
  }

  /** GET /posts/calendar?year&month (인증 필수). */
  getCalendar(_year: number, _month: number, _signal?: AbortSignal): Promise<CalendarMonth> {
    throw new Error('not implemented');
  }
}
