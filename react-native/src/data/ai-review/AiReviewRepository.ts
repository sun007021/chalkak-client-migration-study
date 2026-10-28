import type { ApiClient } from '../../core/http/ApiClient';
import { apiPath } from '../../core/http/UrlBuilder';
import { asArray, asObject, bool, instant, oneOf, str, type Obj } from '../decode';
import type { AiReview, AiReviewResult, AiReviewStatus } from './AiReviewModels';

export type { AiReview, AiReviewResult, AiReviewStatus } from './AiReviewModels';

/** AI 피드백 API 포트. 폴러는 이 인터페이스에만 의존한다. */
export interface AiReviewApi {
  /** GET /posts/{id}/ai-review. 요청 전에도 200 NONE이다. */
  get(postId: string, signal?: AbortSignal): Promise<AiReview>;
  /** POST /posts/{id}/ai-review, 본문 없음. 자동 재전송하지 않는다(D-21). 2xx는 HTTP 코드가 아니라 status로 해석한다. */
  request(postId: string, signal?: AbortSignal): Promise<AiReview>;
}

const STATUSES: readonly AiReviewStatus[] = ['NONE', 'PROCESSING', 'COMPLETED', 'FAILED'];

/** 0~10(양 끝 포함) 유한 숫자. */
function score(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10) {
    throw new Error(`${key} must be a number in [0, 10]`);
  }
  return v;
}

function optInstant(o: Obj, key: string): Date | null {
  return o[key] === undefined || o[key] === null ? null : instant(o, key);
}

function decodeResult(raw: unknown): AiReviewResult {
  const o = asObject(raw, 'result');
  const feedback = asObject(o.feedback, 'feedback');
  return {
    overallScore: score(o, 'overallScore'),
    criteria: asArray(o.criteria, 'criteria').map((item) => {
      const c = asObject(item, 'criterion');
      return { key: str(c, 'key'), label: str(c, 'label'), score: score(c, 'score') };
    }),
    distinctivePerspective: bool(o, 'distinctivePerspective'),
    feedback: {
      summary: str(feedback, 'summary'),
      strength: str(feedback, 'strength'),
      weakness: str(feedback, 'weakness'),
      suggestion: str(feedback, 'suggestion'),
    },
  };
}

/** 모양이 어긋나면 throw하고, ApiClient.requestJson이 InvalidResponseError로 바꾼다. */
export function decodeAiReview(raw: unknown): AiReview {
  const o = asObject(raw, 'ai review');
  const status = oneOf(o, 'status', STATUSES);
  const result = o.result === undefined || o.result === null ? null : decodeResult(o.result);
  if ((status === 'COMPLETED') !== (result !== null)) {
    throw new Error('result does not match status');
  }
  return {
    status,
    requestedAt: optInstant(o, 'requestedAt'),
    completedAt: optInstant(o, 'completedAt'),
    result,
    canRequestAgain:
      o.canRequestAgain === undefined || o.canRequestAgain === null
        ? false
        : bool(o, 'canRequestAgain'),
  };
}

export class AiReviewRepository implements AiReviewApi {
  constructor(private readonly deps: { api: ApiClient }) {}

  get(postId: string, signal?: AbortSignal): Promise<AiReview> {
    return this.deps.api.requestJson(
      { method: 'GET', path: apiPath`/posts/${postId}/ai-review`, signal },
      decodeAiReview,
    );
  }

  request(postId: string, signal?: AbortSignal): Promise<AiReview> {
    return this.deps.api.requestJson(
      { method: 'POST', path: apiPath`/posts/${postId}/ai-review`, signal },
      decodeAiReview,
    );
  }
}
