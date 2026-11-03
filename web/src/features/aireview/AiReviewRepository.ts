import type { ApiClient } from '../../core/net/ApiClient';
import { d, DecodeError } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import { path } from '../../core/net/url';
import type { AiReview, AiReviewResult } from './aiReviewModels';

const STATUSES = ['NONE', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

/** 0~10(양 끝 포함). d.number가 NaN·무한대를 먼저 거절한다. */
const score = (): Decoder<number> => {
  const number = d.number();
  return (value) => {
    const n = number(value);
    if (n < 0 || n > 10) throw new DecodeError(`score out of range: ${n}`);
    return n;
  };
};

const text = (): Decoder<string> => {
  const string = d.string();
  return (value) => {
    const s = string(value);
    if (s.trim() === '') throw new DecodeError('empty text');
    return s;
  };
};

const decodeResult: Decoder<AiReviewResult> = d.object({
  overallScore: score(),
  criteria: d.array(d.object({ key: d.string(), label: d.string(), score: score() })),
  distinctivePerspective: d.boolean(),
  feedback: d.object({ summary: text(), strength: text(), weakness: text(), suggestion: text() }),
});

const decodeBody = d.object({
  status: d.enumOf<typeof STATUSES>(STATUSES),
  requestedAt: d.nullable(d.instant()),
  completedAt: d.nullable(d.instant()),
  result: d.nullable(decodeResult),
  canRequestAgain: d.nullable(d.boolean()),
});

const decodeReview: Decoder<AiReview> = (value) => {
  const body = decodeBody(value);
  if (body.status === 'COMPLETED' && body.result === null) throw new DecodeError('COMPLETED without result');
  if (body.status !== 'COMPLETED' && body.result !== null) throw new DecodeError(`${body.status} with result`);
  return { status: body.status, requestedAt: body.requestedAt, completedAt: body.completedAt, result: body.result, canRequestAgain: body.canRequestAgain ?? false };
};

/**
 * AI 피드백 API(API §4.2). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, 취소는 AbortError). 404도 던진다(저장소가 숨김으로 바꾼다).
 * GET은 D-21 자동 재시도(0.5초·1초, 최대 2회)를 타고 POST는 재시도하지 않는다(REQ-AIR-020). 응답 검증(REQ-AIR-042·043·045):
 * status가 네 값이 아니거나 COMPLETED인데 result가 없거나 COMPLETED가 아닌데 result가 있거나, 점수가 0~10(NaN 포함) 밖이거나, feedback 네 항목 중 비어 있으면 InvalidResponseError.
 */
export class AiReviewRepository {
  constructor(protected readonly deps: { api: ApiClient }) {}

  /** GET /posts/{postId}/ai-review. */
  fetchReview(postId: string, signal?: AbortSignal): Promise<AiReview> {
    return this.deps.api.request({ method: 'GET', path: path`/posts/${postId}/ai-review`, signal }, decodeReview);
  }

  /** POST /posts/{postId}/ai-review. 본문 없음. 2xx(200·202)는 모두 본문의 status로 해석한다. */
  requestReview(postId: string, signal?: AbortSignal): Promise<AiReview> {
    return this.deps.api.request({ method: 'POST', path: path`/posts/${postId}/ai-review`, signal }, decodeReview);
  }
}
