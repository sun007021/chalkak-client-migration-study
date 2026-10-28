import type { AiReviewPoller } from '../AiReviewPoller';

export class FakeAiReviewPoller implements AiReviewPoller {
  /** 'start:<postId>' / 'stop' 순서 기록. */
  readonly calls: string[] = [];

  /** start/stop에 넘어온 소유자(없으면 undefined). calls와 같은 순서. */
  readonly owners: (object | undefined)[] = [];

  start(postId: string, owner?: object): void {
    this.calls.push(`start:${postId}`);
    this.owners.push(owner);
  }

  stop(owner?: object): void {
    this.calls.push('stop');
    this.owners.push(owner);
  }
}
