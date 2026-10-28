import type { LikeChange, LikeController, LikeSnapshot } from './LikeController';

/** 좋아요 PR(PR6) 전까지의 자리표시자: 누르면 아무 일도 없고 알림도 없다. */
export class NoopLikeController implements LikeController {
  toggle(_current: LikeSnapshot): void {}

  snapshot(_postId: string): LikeSnapshot | undefined {
    return undefined;
  }

  subscribe(_listener: (change: LikeChange) => void): () => void {
    return () => {};
  }

  revision(): number {
    return 0;
  }

  latestSince(_postId: string, _since: number): LikeSnapshot | undefined {
    return undefined;
  }
}
