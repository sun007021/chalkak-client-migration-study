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
  publish(_change: PostChange): void {
    throw new Error('not implemented');
  }

  subscribe(_listener: (change: PostChange) => void): () => void {
    throw new Error('not implemented');
  }

  isDeleted(_postId: string): boolean {
    throw new Error('not implemented');
  }

  /** 계정 전환: 삭제 기억을 비운다. */
  clearAll(): void {
    throw new Error('not implemented');
  }
}
