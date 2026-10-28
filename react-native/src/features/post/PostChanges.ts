import type { UserDataCache } from '../../core/push/UserDataCache';

/** 상세에서 일어난 변경을 전시·기록·홈이 따라 반영하게 하는 공유 채널(FEED-024, FEED-036, FEED-044). */
export type PostChange =
  | { kind: 'deleted'; postId: string }
  | { kind: 'title-changed'; postId: string; title: string | null };

export interface PostChanges {
  publish(change: PostChange): void;
  subscribe(listener: (change: PostChange) => void): () => void;
  /** 삭제된 postId는 기억한다. 늦은 목록 응답이 되살리지 못하게 목록 쪽이 걸러 낼 때 쓴다. */
  isDeleted(postId: string): boolean;
}

export class DefaultPostChanges implements PostChanges, UserDataCache {
  private readonly deleted = new Set<string>();
  private readonly listeners = new Set<(change: PostChange) => void>();

  publish(change: PostChange): void {
    if (change.kind === 'deleted') this.deleted.add(change.postId);
    // 순회 중 구독 해제가 있어도 안전하도록 복사해서 돈다. 한 구독자의 예외가 나머지를 막지 않는다.
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        console.error(error);
      }
    }
  }

  subscribe(listener: (change: PostChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isDeleted(postId: string): boolean {
    return this.deleted.has(postId);
  }

  /** 계정 전환: 삭제 기억을 비운다. */
  clearAll(): void {
    this.deleted.clear();
  }
}
