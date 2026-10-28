import type { ApiClient } from '../../core/net/ApiClient';
import type { PostDetail } from '../post/postModels';

/**
 * 상세·제목 수정·삭제 API(API §1.3). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError). 404도 던진다(상세는 NotFound 화면이 필요하다).
 * 모두 멱등이라 D-21 자동 재시도(0.5초·1초, 최대 2회)를 거친다.
 */
export class FeedRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/{postId}. 필수 필드 누락·likeCount 문자열/음수·topic 누락이면 InvalidResponseError. thumbnailImageUrl·signatureOriginalImageUrl·title은 null 허용. */
  fetchPost(_postId: string, _signal?: AbortSignal): Promise<PostDetail> {
    throw new Error('not implemented');
  }

  /** PUT /posts/{postId} 본문 `{"title": 문자열 | null}`(키 필수). 응답 `{postId, title}`의 title을 돌려준다. 응답 postId가 다르면 InvalidResponseError. */
  updateTitle(_postId: string, _title: string | null, _signal?: AbortSignal): Promise<{ title: string | null }> {
    throw new Error('not implemented');
  }

  /** DELETE /posts/{postId}. 204. */
  deletePost(_postId: string, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
