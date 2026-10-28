import type { LikeChange, LikeController, LikeSnapshot } from '../LikeController';

export class FakeLikeController implements LikeController {
  readonly toggled: LikeSnapshot[] = [];
  private readonly snapshots = new Map<string, LikeSnapshot>();
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

  /** 컨트롤러가 결과를 알리는 상황을 흉내 낸다(낙관 갱신, 롤백, 확정). */
  emit(change: LikeChange): void {
    if (change.kind === 'updated') this.snapshots.set(change.snapshot.postId, change.snapshot);
    else this.snapshots.delete(change.postId);
    [...this.listeners].forEach((listener) => listener(change));
  }

  /** 알림 없이 컨트롤러가 이미 아는 값만 넣는다(다른 화면에서 누른 좋아요). */
  seed(snapshot: LikeSnapshot): void {
    this.snapshots.set(snapshot.postId, snapshot);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
