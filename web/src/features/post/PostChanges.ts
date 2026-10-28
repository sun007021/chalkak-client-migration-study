import type { PostChange } from './postModels';

export type PostChangeListener = (change: PostChange) => void;

/**
 * 화면 사이 게시물 변경 이벤트 통로(전시·홈 랭킹·상세가 공유). 컨테이너가 하나를 들고 UserCaches로 비운다.
 * 'removed'는 기억해 두어 늦게 도착한 목록 응답이 삭제된 게시물을 되살리지 못하게 한다(TC-FEED-044).
 */
export class PostChanges {
  private readonly listeners = new Set<PostChangeListener>();
  private readonly removed = new Set<string>();

  /** 구독자 전원에게 알린다. 'removed'면 wasRemoved(postId)가 true가 된다. */
  publish(change: PostChange): void {
    if (change.type === 'removed') this.removed.add(change.postId.toLowerCase());
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch {
        // 구독자 하나의 실패가 다른 구독자에게 알리는 것을 막지 않는다.
      }
    }
  }

  /** 해제 함수를 돌려준다. */
  subscribe(listener: PostChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 이 세션에서 삭제·비공개로 확인된 게시물인가. */
  wasRemoved(postId: string): boolean {
    return this.removed.has(postId.toLowerCase());
  }

  /** 응답에서 삭제된 게시물을 뺀 새 배열. */
  withoutRemoved<T extends { id: string }>(items: readonly T[]): T[] {
    return items.filter((item) => !this.wasRemoved(item.id));
  }

  /** 계정 전환·로그아웃: 기억한 삭제 목록을 비운다(구독자는 유지). */
  reset(): void {
    this.removed.clear();
  }
}
