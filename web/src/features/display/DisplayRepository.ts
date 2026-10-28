import { PAGE_SIZE } from '../../constants';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import { ApiError, InvalidResponseError } from '../../core/net/errors';
import type { DateString } from '../../core/time/kst';
import type { HomeTopic } from '../home/homeModels';
import type { PostItem } from '../post/postModels';
import type { DisplaySort } from './displayDates';
export interface PostsPage { currentPage: number; pageSize: number; hasNext: boolean; randomSeed: string | null; posts: PostItem[] }
export interface PostsQuery { topicDate: DateString; sort: DisplaySort; page: number; randomSeed?: string | null }
const is404 = (e: unknown) => e instanceof ApiError && e.status === 404 && e.errorCode === 'BUSINESS_ERROR';
const nonNeg = (): Decoder<number> => { const n = d.number(); return (v) => { const x = n(v); if (x < 0) throw new InvalidResponseError('neg'); return x; }; };
const topic = d.object({ id: d.string(), title: d.string(), topicDate: d.string(), phase: d.enumOf(['BEFORE_OPEN', 'OPEN', 'CLOSED']) });
const page = d.object({
  currentPage: d.number(), pageSize: d.number(), hasNext: d.boolean(), randomSeed: d.nullable(d.string()),
  posts: d.array(d.object({ id: d.string(), authorId: d.string(), originalImageUrl: d.string(), thumbnailImageUrl: d.nullable(d.string()), signatureOriginalImageUrl: d.nullable(d.string()), signatureThumbnailImageUrl: d.nullable(d.string()), title: d.nullable(d.string()), likeCount: nonNeg(), isLiked: d.boolean(), isMine: d.boolean() })),
});
export class DisplayRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}
  async fetchTopic(date: DateString, signal?: AbortSignal): Promise<HomeTopic | null> {
    try {
      const t = await this.deps.api.request({ method: 'GET', path: '/topics', query: { date }, signal }, topic);
      if (t.topicDate !== date) throw new InvalidResponseError('mismatch');
      return t as HomeTopic;
    } catch (e) { if (is404(e)) return null; throw e; }
  }
  async fetchPosts(q: PostsQuery, signal?: AbortSignal): Promise<PostsPage | null> {
    if (!Number.isInteger(q.page) || q.page < 1) throw new RangeError('page');
    let seed: string | undefined;
    if (q.sort === 'random') {
      if (q.randomSeed !== undefined && q.randomSeed !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(q.randomSeed)) throw new RangeError('seed');
      if (q.page >= 2 && !q.randomSeed) throw new RangeError('seed required');
      seed = q.randomSeed ?? undefined;
    }
    try {
      return await this.deps.api.request({ method: 'GET', path: '/posts', query: { topicDate: q.topicDate, sort: q.sort, page: q.page, pageSize: PAGE_SIZE, randomSeed: seed }, signal }, page);
    } catch (e) { if (is404(e)) return null; throw e; }
  }
}
