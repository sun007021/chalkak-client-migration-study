import type { AiReviewPoller } from '../AiReviewPoller';

export class FakeAiReviewPoller implements AiReviewPoller {
  /** 'start:<postId>' / 'stop' 순서 기록. */
  readonly calls: string[] = [];

  start(postId: string): void {
    this.calls.push(`start:${postId}`);
  }

  stop(): void {
    this.calls.push('stop');
  }
}
