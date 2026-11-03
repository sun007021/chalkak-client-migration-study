import type { ApiClient } from '../../core/net/ApiClient';

export interface FeedbackReceipt {
  feedbackId: string;
  /** epoch ms (UTC Instant). */
  createdAt: number;
}

/** W11 구현 대기(스텁). POST /feedbacks {content}만(앱 버전·기기 정보 없음, Q-13) → 201 {feedbackId, createdAt}. 자동 재시도 없음(D-21). content는 호출자가 이미 trim한 값을 그대로 보낸다. */
export class FeedbackRepository {
  constructor(private readonly deps: { api: ApiClient }) {}

  submit(content: string, signal?: AbortSignal): Promise<FeedbackReceipt> {
    void this.deps;
    void content;
    void signal;
    throw new Error('not implemented');
  }
}
