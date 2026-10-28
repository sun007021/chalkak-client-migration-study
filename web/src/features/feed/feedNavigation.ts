import { ROUTES } from '../../app/paths';
import type { PostSeed } from '../post/postModels';
export function feedLocationState(seed: PostSeed): { seed: PostSeed } { return { seed }; }
export function readFeedSeed(state: unknown, postId: string): PostSeed | null {
  if (typeof state !== 'object' || state === null) return null;
  const seed = (state as { seed?: unknown }).seed as Record<string, unknown> | undefined;
  if (typeof seed !== 'object' || seed === null) return null;
  if (typeof seed.id !== 'string' || seed.id.toLowerCase() !== postId.toLowerCase()) return null;
  if (typeof seed.authorId !== 'string' || typeof seed.originalImageUrl !== 'string') return null;
  if (typeof seed.likeCount !== 'number' || seed.likeCount < 0 || typeof seed.isLiked !== 'boolean' || typeof seed.isMine !== 'boolean') return null;
  return seed as unknown as PostSeed;
}
export type FeedClosePlan = { kind: 'back' } | { kind: 'replace'; to: string };
export function planFeedClose(l: { key: string }): FeedClosePlan { return l.key === 'default' ? { kind: 'replace', to: ROUTES.home } : { kind: 'back' }; }
