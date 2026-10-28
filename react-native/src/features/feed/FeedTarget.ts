import type { PostSummary } from '../../data/post/PostModels';

/** 상세를 어디서 열었나. list는 목록의 isMine을, mine은 기록·푸시(내 게시물)를 임시 판정에 쓴다(D-26). */
export type FeedEntry = 'list' | 'mine';

/** 내비게이션 파라미터로 실을 수 있는 시드(Date 같은 직렬화 불가 값이 없다). */
export type FeedSeed = Pick<
  PostSummary,
  | 'id'
  | 'authorId'
  | 'originalImageUrl'
  | 'thumbnailImageUrl'
  | 'signatureOriginalImageUrl'
  | 'title'
  | 'likeCount'
  | 'isLiked'
  | 'isMine'
>;

export type FeedTarget = {
  postId: string;
  entry: FeedEntry;
  /** 전시·홈 랭킹에서는 목록 항목, 기록·푸시에서는 없다. */
  seed: FeedSeed | null;
  /** 기록에서 열 때 전달받은 썸네일(상세 응답 전에 먼저 보여 줄 수 있다). */
  thumbnailUrl?: string | null;
};

/** 목록 항목에서 내비게이션 시드를 만든다(필요한 필드만 복사). */
export function toFeedSeed(_post: PostSummary): FeedSeed {
  throw new Error('not implemented');
}
