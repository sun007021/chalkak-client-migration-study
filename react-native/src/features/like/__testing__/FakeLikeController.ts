import type { LikeChange, LikeController, LikeSnapshot } from '../LikeController';

export class FakeLikeController implements LikeController {
  readonly toggled: LikeSnapshot[] = [];
  private readonly snapshots = new Map<string, LikeSnapshot>();
  private readonly revisions = new Map<string, number>();
  private counter = 0;
  private readonly listeners = new Set<(change: LikeChange) => void>();

  toggle(current: LikeSnapshot): void {
    this.toggled.push({ ...current });
  }

  snapshot(postId: string): LikeSnapshot | undefined {
    return this.snapshots.get(postId);
  }

  subscribe(listener: (change: LikeChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  revision(): number {
    return this.counter;
  }

  latestSince(postId: string, since: number): LikeSnapshot | undefined {
    const changedAt = this.revisions.get(postId);
    return changedAt !== undefined && changedAt > since ? this.snapshots.get(postId) : undefined;
  }

  /** 컨트롤러가 결과를 알리는 상황을 흉내 낸다(낙관 갱신, 롤백, 확정). */
  emit(change: LikeChange): void {
    this.counter += 1;
    if (change.kind === 'updated') {
      this.snapshots.set(change.snapshot.postId, change.snapshot);
      this.revisions.set(change.snapshot.postId, this.counter);
    } else {
      this.snapshots.delete(change.postId);
      this.revisions.delete(change.postId);
    }
    [...this.listeners].forEach((listener) => listener(change));
  }

  /** 알림 없이 컨트롤러가 이미 아는 값만 넣는다(다른 화면에서 누른 좋아요). */
  seed(snapshot: LikeSnapshot): void {
    this.counter += 1;
    this.snapshots.set(snapshot.postId, snapshot);
    this.revisions.set(snapshot.postId, this.counter);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
