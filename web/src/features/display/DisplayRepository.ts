import { PAGE_SIZE } from '../../constants';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { ApiError, InvalidResponseError } from '../../core/net/errors';
import { parseDateString } from '../../core/time/kst';
import type { DateString } from '../../core/time/kst';
import type { HomeTopic } from '../home/homeModels';
import { decodePostItem } from '../post/postDecoders';
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

/** 본문의 errorCode까지 읽은 404(서버가 만든 "없음")만 값으로 바꾼다. 게이트웨이 HTML 같은 본문 없는 404는 오류로 둔다. */
const isBusiness404 = (error: unknown): boolean => error instanceof ApiError && error.status === 404 && error.errorCode === 'BUSINESS_ERROR';

const SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

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
  phase: d.enumOf(['BEFORE_OPEN', 'OPEN', 'CLOSED'] as const) as (value: unknown) => HomeTopic['phase'],
});

const decodePage = d.object({
  currentPage: d.number(),
  pageSize: d.number(),
  hasNext: d.boolean(),
  randomSeed: d.nullable(d.string()),
  posts: d.array(decodePostItem),
});

/**
 * 전시가 쓰는 읽기 API(API §1.3, §1.4). 던지는 것은 ApiClient와 같다.
 * 요청을 만들 수 없는 입력(randomSeed가 `[A-Za-z0-9_-]{1,64}`가 아님, page<1, sort=random인데 page≥2에 시드 없음)은 요청 없이 거절한다.
 */
export class DisplayRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /topics?date=. 404 BUSINESS_ERROR → null. 응답 topicDate가 요청 date와 다르면 InvalidResponseError. */
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

  /** GET /posts?topicDate=&sort=&page=&pageSize=20(&randomSeed=). 404 BUSINESS_ERROR → null. 항목의 필수 필드 누락·likeCount<0이면 InvalidResponseError. */
  async fetchPosts(query: PostsQuery, signal?: AbortSignal): Promise<PostsPage | null> {
    if (!Number.isInteger(query.page) || query.page < 1) throw new RangeError(`invalid page: ${query.page}`);
    const random = query.sort === 'random';
    const seed = query.randomSeed ?? null;
    if (random && seed !== null && !SEED_PATTERN.test(seed)) throw new RangeError('invalid randomSeed');
    if (random && query.page >= 2 && seed === null) throw new RangeError('randomSeed is required from page 2');
    try {
      return await this.deps.api.request(
        {
          method: 'GET',
          path: '/posts',
          query: { topicDate: query.topicDate, sort: query.sort, page: query.page, pageSize: PAGE_SIZE, randomSeed: random ? seed : null },
          signal,
        },
        decodePage,
      );
    } catch (error) {
      if (isBusiness404(error)) return null;
      throw error;
    }
  }
}
