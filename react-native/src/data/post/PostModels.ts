import type { KstDate } from '../../core/time/KstDate';

/** GET /posts 항목. 전시·홈 랭킹이 같이 쓴다. */
export type PostSummary = {
  id: string;
  authorId: string;
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  signatureOriginalImageUrl: string;
  signatureThumbnailImageUrl: string | null;
  title: string | null;
  submittedAt: Date;
  likeCount: number;
  isLiked: boolean;
  isMine: boolean;
};

export type PostListPage = {
  currentPage: number;
  pageSize: number;
  hasNext: boolean;
  /** 랜덤 정렬 응답의 시드. 다른 정렬이거나 서버가 주지 않으면 null(생략). */
  randomSeed?: string | null;
  posts: readonly PostSummary[];
};

/** GET /posts/{id}. `isMine`이 없으므로 내 게시물 판정은 authorId로 한다(D-26). */
export type PostDetail = {
  id: string;
  authorId: string;
  topic: { id: string; title: string; topicDate: KstDate };
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  signatureOriginalImageUrl: string;
  title: string | null;
  likeCount: number;
  isLiked: boolean;
};

/** PUT /posts/{id} 응답. */
export type TitleUpdateResult = { postId: string; title: string | null };

export type PostSort = 'recent' | 'popular' | 'random';

/** 내 게시물의 검수 상태(GET /posts/today). 알 수 없는 값은 디코딩 단계에서 InvalidResponseError. */
export type TodayModerationStatus = 'VALIDATING' | 'PENDING' | 'APPROVED';

/** isPosted=false이면 postId·moderationStatus는 항상 없다(서버 null). 어긋난 조합은 InvalidResponseError(REQ-HOME-017). */
export type TodayPost =
  | { topicDate: KstDate; isPosted: false }
  | {
      topicDate: KstDate;
      isPosted: true;
      postId: string;
      moderationStatus: TodayModerationStatus;
    };

export type CalendarStatus = 'PENDING' | 'APPROVED';

export type CalendarEntry = {
  topicDate: KstDate;
  postId: string;
  thumbnailImageUrl: string | null;
  status: CalendarStatus;
};

export type CalendarMonth = { year: number; month: number; posts: readonly CalendarEntry[] };
