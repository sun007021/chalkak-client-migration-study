import type { ApiClient } from '../../core/http/ApiClient';
import { apiPath } from '../../core/http/UrlBuilder';
import { asObject, bool, nonNegInt, str } from '../decode';

/** 좋아요 PUT/DELETE의 성공 응답. */
export type LikeResult = { postId: string; likeCount: number; isLiked: boolean };

/** 좋아요 API 포트. 컨트롤러는 이 인터페이스에만 의존한다. */
export interface LikeApi {
  /** PUT /posts/{id}/likes, 본문 없음. 응답 postId가 다르거나 isLiked=false면 InvalidResponseError. */
  like(postId: string, signal?: AbortSignal): Promise<LikeResult>;
  /** DELETE /posts/{id}/likes. 응답 postId가 다르거나 isLiked=true면 InvalidResponseError. */
  unlike(postId: string, signal?: AbortSignal): Promise<LikeResult>;
}

export type LikeRepositoryDeps = { api: ApiClient };

function decodeLike(postId: string, expectedLiked: boolean) {
  return (raw: unknown): LikeResult => {
    const o = asObject(raw, 'like result');
    const result: LikeResult = {
      postId: str(o, 'postId'),
      likeCount: nonNegInt(o, 'likeCount'),
      isLiked: bool(o, 'isLiked'),
    };
    if (result.postId !== postId) throw new Error('postId mismatch');
    if (result.isLiked !== expectedLiked) throw new Error('isLiked contradicts the request');
    return result;
  };
}

export class LikeRepository implements LikeApi {
  constructor(private readonly deps: LikeRepositoryDeps) {}

  like(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.deps.api.requestJson(
      { method: 'PUT', path: apiPath`/posts/${postId}/likes`, signal },
      decodeLike(postId, true),
    );
  }

  unlike(postId: string, signal?: AbortSignal): Promise<LikeResult> {
    return this.deps.api.requestJson(
      { method: 'DELETE', path: apiPath`/posts/${postId}/likes`, signal },
      decodeLike(postId, false),
    );
  }
}
