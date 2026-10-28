import type { PostChange } from './postModels';
export type PostChangeListener = (change: PostChange) => void;
export class PostChanges {
  private listeners = new Set<PostChangeListener>();
  private removed = new Set<string>();
  publish(change: PostChange): void {
    if (change.type === 'removed') this.removed.add(change.postId);
    for (const l of [...this.listeners]) { try { l(change); } catch { /* */ } }
  }
  subscribe(listener: PostChangeListener): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  wasRemoved(id: string): boolean { return this.removed.has(id); }
  withoutRemoved<T extends { id: string }>(items: readonly T[]): T[] { return items.filter((i) => !this.removed.has(i.id)); }
  reset(): void { this.removed.clear(); }
}
