import type { ApiClient } from '../../core/http/ApiClient';

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

export class LikeRepository implements LikeApi {
  constructor(private readonly deps: LikeRepositoryDeps) {}

  like(_postId: string, _signal?: AbortSignal): Promise<LikeResult> {
    void this.deps;
    throw new Error('not implemented');
  }

  unlike(_postId: string, _signal?: AbortSignal): Promise<LikeResult> {
    throw new Error('not implemented');
  }
}
