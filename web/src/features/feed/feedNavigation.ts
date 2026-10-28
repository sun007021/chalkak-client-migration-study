import { ROUTES } from '../../app/paths';
import type { PostSeed } from '../post/postModels';

/** 상세를 push할 때 넣는 location state. 새로고침하면 브라우저가 history.state를 유지하므로 시드도 남는다. */
export function feedLocationState(seed: PostSeed): { seed: PostSeed } {
  return { seed };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNullableString = (value: unknown): boolean => value === null || value === undefined || typeof value === 'string';
/** history.state는 사용자가 바꿀 수 있는 입력이다: 이미지 URL은 https만 받는다(javascript:·data: 등 거절). */
const isHttpsUrl = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const isNullableHttpsUrl = (value: unknown): boolean => value === null || value === undefined || isHttpsUrl(value);

/**
 * location.state에서 시드를 꺼낸다. 객체가 아니거나 필수 필드(id, authorId, originalImageUrl(https), likeCount(음수 아님), isLiked, isMine) 모양이 틀리거나
 * seed.id가 postId와 다르면(대소문자 무시) null — 믿을 수 있는 시드만 쓴다.
 */
export function readFeedSeed(state: unknown, postId: string): PostSeed | null {
  if (!isRecord(state)) return null;
  const seed = state['seed'];
  if (!isRecord(seed)) return null;
  const { id, authorId, originalImageUrl, likeCount, isLiked, isMine } = seed;
  if (typeof id !== 'string' || id.toLowerCase() !== postId.toLowerCase()) return null;
  if (typeof authorId !== 'string' || !isHttpsUrl(originalImageUrl)) return null;
  if (typeof likeCount !== 'number' || !Number.isFinite(likeCount) || likeCount < 0) return null;
  if (typeof isLiked !== 'boolean' || typeof isMine !== 'boolean') return null;
  if (!isNullableHttpsUrl(seed['thumbnailImageUrl']) || !isNullableString(seed['title']) || !isNullableHttpsUrl(seed['signatureOriginalImageUrl'])) return null;
  return seed as unknown as PostSeed;
}

export type FeedClosePlan = { kind: 'back' } | { kind: 'replace'; to: string };

/**
 * 닫기 버튼의 이동 계획. 앱 안에서 push한 항목(location.key !== 'default')이면 뒤로(이전 화면·스크롤 복원),
 * 새로고침·딥링크로 첫 항목이 된 경우(key === 'default')에는 홈으로 replace(임시: 어디서 왔는지 알 수 없다).
 */
export function planFeedClose(location: { key: string }): FeedClosePlan {
  return location.key !== 'default' ? { kind: 'back' } : { kind: 'replace', to: ROUTES.home };
}
