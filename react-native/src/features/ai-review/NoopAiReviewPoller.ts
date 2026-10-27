import type { AiReviewPoller } from './AiReviewPoller';

/** AI 리뷰 PR(PR8) 전까지의 자리표시자: 폴링하지 않는다. */
export class NoopAiReviewPoller implements AiReviewPoller {
  start(_postId: string): void {}
  stop(): void {}
}
