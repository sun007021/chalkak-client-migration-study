import type { PostSeed } from '../post/postModels';

/** 상세를 push할 때 넣는 location state. 새로고침하면 브라우저가 history.state를 유지하므로 시드도 남는다. */
export function feedLocationState(_seed: PostSeed): { seed: PostSeed } {
  throw new Error('not implemented');
}

/**
 * location.state에서 시드를 꺼낸다. 객체가 아니거나 필수 필드(id, authorId, originalImageUrl, likeCount(음수 아님), isLiked, isMine) 모양이 틀리거나
 * seed.id가 postId와 다르면(대소문자 무시) null — 믿을 수 있는 시드만 쓴다.
 */
export function readFeedSeed(_state: unknown, _postId: string): PostSeed | null {
  throw new Error('not implemented');
}

export type FeedClosePlan = { kind: 'back' } | { kind: 'replace'; to: string };

/**
 * 닫기 버튼의 이동 계획. 앱 안에서 push한 항목(location.key !== 'default')이면 뒤로(이전 화면·스크롤 복원),
 * 새로고침·딥링크로 첫 항목이 된 경우(key === 'default')에는 홈으로 replace(임시: 어디서 왔는지 알 수 없다).
 */
export function planFeedClose(_location: { key: string }): FeedClosePlan {
  throw new Error('not implemented');
}
