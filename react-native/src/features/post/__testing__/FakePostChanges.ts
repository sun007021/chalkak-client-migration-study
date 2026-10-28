import type { PostChange, PostChanges } from '../PostChanges';

export class FakePostChanges implements PostChanges {
  readonly published: PostChange[] = [];
  private readonly deleted = new Set<string>();
  private readonly listeners = new Set<(change: PostChange) => void>();

  publish(change: PostChange): void {
    this.published.push(change);
    if (change.kind === 'deleted') this.deleted.add(change.postId);
    [...this.listeners].forEach((listener) => listener(change));
  }

  subscribe(listener: (change: PostChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isDeleted(postId: string): boolean {
    return this.deleted.has(postId);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
