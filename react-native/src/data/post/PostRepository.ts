import type { ApiClient } from '../../core/http/ApiClient';
import type { KstDate } from '../../core/time/KstDate';
import { PAGE_SIZE } from '../../shared/constants';
import type {
  CalendarMonth,
  PostDetail,
  PostListPage,
  PostSort,
  TitleUpdateResult,
  TodayPost,
} from './PostModels';
import { decodeCalendarMonth, decodePostListPage, decodeTodayPost } from './postDecoders';

export type PostRepositoryDeps = { api: ApiClient };

export type ListPostsInput = {
  topicDate: KstDate;
  sort: PostSort;
  /** 기본 1 */
  page?: number;
  /** 기본 PAGE_SIZE(20) */
  pageSize?: number;
  /** random 정렬의 2페이지부터(첫 페이지 재검증에도) 보낸다. `[A-Za-z0-9_-]{1,64}`만 허용(어기면 요청 없이 throw). */
  randomSeed?: string;
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

  /** GET /posts/{postId} (인증 필수). */
  getDetail(_postId: string, _signal?: AbortSignal): Promise<PostDetail> {
    throw new Error('not implemented');
  }

  /** PUT /posts/{postId} 본문 `{"title": 문자열 | null}`(키 필수). 호출자가 trim한 값을 넘긴다. */
  updateTitle(
    _postId: string,
    _title: string | null,
    _signal?: AbortSignal,
  ): Promise<TitleUpdateResult> {
    throw new Error('not implemented');
  }

  /** DELETE /posts/{postId} → 204. */
  delete(_postId: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
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
