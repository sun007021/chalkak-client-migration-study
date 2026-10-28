import type { ApiClient } from '../../core/net/ApiClient';

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
  like(_postId: string, _signal?: AbortSignal): Promise<LikeResult> {
    throw new Error('not implemented');
  }

  /** DELETE /posts/{postId}/likes. 응답 postId가 요청과 다르거나 isLiked=true(모순)면 InvalidResponseError. */
  unlike(_postId: string, _signal?: AbortSignal): Promise<LikeResult> {
    throw new Error('not implemented');
  }
}
