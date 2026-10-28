import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import { InvalidResponseError } from '../../core/net/errors';
import { path } from '../../core/net/url';
import { nonNegativeNumber } from '../post/postDecoders';

const decodeLike = d.object({ postId: d.string(), likeCount: nonNegativeNumber(), isLiked: d.boolean() });

/** 좋아요 PUT/DELETE의 성공 응답(API §1.3). */
export interface LikeResult {
  postId: string;
  likeCount: number;
  isLiked: boolean;
}

/**
 * 좋아요 API. 본문 없는 PUT/DELETE `/posts/{postId}/likes`이고 멱등이라 D-21 자동 재시도를 거친다.
 * 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError).
 */
export class LikeRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** PUT /posts/{postId}/likes. 응답 postId가 요청과 다르거나 isLiked=false(모순)면 InvalidResponseError. */
  like(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.send('PUT', postId, true, signal);
  }

  /** DELETE /posts/{postId}/likes. 응답 postId가 요청과 다르거나 isLiked=true(모순)면 InvalidResponseError. */
  unlike(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.send('DELETE', postId, false, signal);
  }

  private async send(method: 'PUT' | 'DELETE', postId: string, expectedLiked: boolean, signal?: AbortSignal): Promise<LikeResult> {
    const body = await this.deps.api.request({ method, path: path`/posts/${postId}/likes`, signal }, decodeLike);
    if (body.postId.toLowerCase() !== postId.toLowerCase()) throw new InvalidResponseError(`postId mismatch: ${body.postId}`);
    if (body.isLiked !== expectedLiked) throw new InvalidResponseError(`isLiked contradicts ${method}`);
    return body;
  }
}
