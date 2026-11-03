import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { InvalidResponseError } from '../../core/net/errors';
import { path } from '../../core/net/url';
import { parseDateString } from '../../core/time/kst';
import { nonNegativeNumber } from '../post/postDecoders';
import type { PostDetail } from '../post/postModels';

const topicDate = (): ((value: unknown) => string) => {
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

const decodeDetail = d.object({
  id: d.string(),
  authorId: d.string(),
  topic: d.object({ id: d.string(), title: d.string(), topicDate: topicDate() }),
  originalImageUrl: d.string(),
  thumbnailImageUrl: d.nullable(d.string()),
  signatureOriginalImageUrl: d.nullable(d.string()),
  title: d.nullable(d.string()),
  likeCount: nonNegativeNumber(),
  isLiked: d.boolean(),
});

const decodeTitleResult = d.object({ postId: d.string(), title: d.nullable(d.string()) });

/**
 * 상세·제목 수정·삭제 API(API §1.3). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError). 404도 던진다(상세는 NotFound 화면이 필요하다).
 * 모두 멱등이라 D-21 자동 재시도(0.5초·1초, 최대 2회)를 거친다.
 */
export class FeedRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/{postId}. 필수 필드 누락·likeCount 문자열/음수·topic 누락이면 InvalidResponseError. thumbnailImageUrl·signatureOriginalImageUrl·title은 null 허용. */
  fetchPost(postId: string, signal?: AbortSignal): Promise<PostDetail> {
    return this.deps.api.request({ method: 'GET', path: path`/posts/${postId}`, signal }, decodeDetail);
  }

  /** PUT /posts/{postId} 본문 `{"title": 문자열 | null}`(키 필수). 응답 `{postId, title}`의 title을 돌려준다. 응답 postId가 다르면 InvalidResponseError. */
  async updateTitle(postId: string, title: string | null, signal?: AbortSignal): Promise<{ title: string | null }> {
    const body = await this.deps.api.request({ method: 'PUT', path: path`/posts/${postId}`, body: { title }, signal }, decodeTitleResult);
    if (body.postId.toLowerCase() !== postId.toLowerCase()) throw new InvalidResponseError(`postId mismatch: ${body.postId}`);
    return { title: body.title };
  }

  /** DELETE /posts/{postId}. 204. */
  deletePost(postId: string, signal?: AbortSignal): Promise<void> {
    return this.deps.api.requestVoid({ method: 'DELETE', path: path`/posts/${postId}`, signal });
  }
}
