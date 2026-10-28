import { feedPath } from '../../app/paths';
import type { PostSeed } from './postModels';
export interface PostDetailNavigator { openPostDetail(target: { postId: string; seed: PostSeed }): void }
export type NavigateFn = (to: string, options?: { state?: unknown }) => void | Promise<void>;
export class AttachablePostNavigator implements PostDetailNavigator {
  private target: PostDetailNavigator | null = null;
  attach(target: PostDetailNavigator): () => void { this.target = target; return () => { if (this.target === target) this.target = null; }; }
  openPostDetail(t: { postId: string; seed: PostSeed }): void { this.target?.openPostDetail(t); }
}
export class RouterPostNavigator implements PostDetailNavigator {
  constructor(private readonly navigate: NavigateFn) {}
  openPostDetail(t: { postId: string; seed: PostSeed }): void { void this.navigate(feedPath(t.postId), { state: { seed: t.seed } }); }
}
