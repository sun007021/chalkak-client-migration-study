import type { ApiClient } from '../../core/net/ApiClient';
import type { DateString } from '../../core/time/kst';
import type { HomeTopic } from '../home/homeModels';
import type { PostItem } from '../post/postModels';
import type { DisplaySort } from './displayDates';

export interface PostsPage {
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  /** 랜덤이 아니면 null. */
  randomSeed: string | null;
  posts: PostItem[];
}

export interface PostsQuery {
  topicDate: DateString;
  sort: DisplaySort;
  /** 1부터. */
  page: number;
  /** sort=random일 때만 보낸다(2페이지부터 필수, 첫 페이지 재검증에도 저장값). 다른 정렬에서는 주어져도 보내지 않는다(F5). */
  randomSeed?: string | null;
}

/**
 * 전시가 쓰는 읽기 API(API §1.3, §1.4). 던지는 것은 ApiClient와 같다.
 * 요청을 만들 수 없는 입력(randomSeed가 `[A-Za-z0-9_-]{1,64}`가 아님, page<1, sort=random인데 page≥2에 시드 없음)은 요청 없이 거절한다.
 */
export class DisplayRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /topics?date=. 404 BUSINESS_ERROR → null. 응답 topicDate가 요청 date와 다르면 InvalidResponseError. */
  fetchTopic(_date: DateString, _signal?: AbortSignal): Promise<HomeTopic | null> {
    throw new Error('not implemented');
  }

  /** GET /posts?topicDate=&sort=&page=&pageSize=20(&randomSeed=). 404 BUSINESS_ERROR → null. 항목의 필수 필드 누락·likeCount<0이면 InvalidResponseError. */
  fetchPosts(_query: PostsQuery, _signal?: AbortSignal): Promise<PostsPage | null> {
    throw new Error('not implemented');
  }
}
