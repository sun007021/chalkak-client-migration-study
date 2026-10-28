import type { ApiClient } from '../../core/http/ApiClient';
import { asObject, instant, str } from '../decode';

export type FeedbackReceipt = { feedbackId: string; createdAt: Date };

export type FeedbackRepositoryDeps = { api: ApiClient };

/** 피드백 API. POST는 자동 재시도 대상이 아니다(D-21, RequestPolicy). */
export class FeedbackRepository {
  constructor(private readonly deps: FeedbackRepositoryDeps) {}

  /** POST /feedbacks {content}. content는 호출자가 이미 trim한 값이며 여기서 가공하지 않는다. */
  submit(content: string, signal?: AbortSignal): Promise<FeedbackReceipt> {
    return this.deps.api.requestJson(
      { method: 'POST', path: '/feedbacks', body: { content }, signal },
      (raw) => {
        const o = asObject(raw, 'feedback');
        return { feedbackId: str(o, 'feedbackId'), createdAt: instant(o, 'createdAt') };
      },
    );
  }
}
