import type { ApiClient } from '../../core/net/ApiClient';
import type { AiReview } from './aiReviewModels';

/**
 * AI 피드백 API(API §4.2). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError). 404도 던진다(저장소가 숨김으로 바꾼다).
 * GET은 D-21 자동 재시도(0.5초·1초, 최대 2회)를 타고 POST는 재시도하지 않는다(REQ-AIR-020). 응답 검증(REQ-AIR-042·043·045):
 * status가 네 값이 아니거나 COMPLETED인데 result가 없거나 COMPLETED가 아닌데 result가 있거나, 점수가 0~10(NaN 포함) 밖이거나, feedback 네 항목 중 비어 있으면 InvalidResponseError.
 */
export class AiReviewRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/{postId}/ai-review. */
  fetchReview(_postId: string, _signal?: AbortSignal): Promise<AiReview> {
    throw new Error('not implemented');
  }

  /** POST /posts/{postId}/ai-review. 본문 없음. 2xx(200·202)는 모두 본문의 status로 해석한다. */
  requestReview(_postId: string, _signal?: AbortSignal): Promise<AiReview> {
    throw new Error('not implemented');
  }
}
