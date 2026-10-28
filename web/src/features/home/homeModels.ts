import type { DateString } from '../../core/time/kst';

/** GET /topics?date= 응답(API §1.4). */
export interface HomeTopic {
  id: string;
  title: string;
  topicDate: DateString;
  phase: 'BEFORE_OPEN' | 'OPEN' | 'CLOSED';
}

/** GET /posts 목록 항목(API §1.3). 홈 랭킹이 쓰는 필드. */
export interface PostSummary {
  id: string;
  authorId: string;
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  title: string | null;
  likeCount: number;
  isLiked: boolean;
  isMine: boolean;
}

/** GET /posts/today를 D-06 판정에 맞게 해석한 결과. 알 수 없는 moderationStatus·isPosted 불일치(REQ-HOME-017)는 값이 아니라 InvalidResponseError로 던진다. */
export type TodayPost =
  | { kind: 'no-open-topic' }
  | { kind: 'banned' }
  | { kind: 'not-posted'; topicDate: DateString }
  | { kind: 'posted'; topicDate: DateString; postId: string; moderationStatus: 'VALIDATING' | 'PENDING' | 'APPROVED' };

/** GET /posts/calendar 항목(REJECTED·VALIDATING은 서버가 주지 않는다). */
export interface CalendarEntry {
  topicDate: DateString;
  postId: string;
  thumbnailImageUrl: string | null;
  status: 'PENDING' | 'APPROVED';
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  /** 항상 https + 호스트(아니면 응답 전체가 InvalidResponseError, REQ-BANR-003). */
  webViewUrl: string;
  /** 형식이 잘못된 썸네일은 null(대체 배경). */
  thumbnailUrl: string | null;
  createdAt: number;
}

export interface BannerPage {
  currentPage: number;
  pageSize: number;
  /** 필드가 없으면 false(REQ-BANR-002). */
  hasNext: boolean;
  banners: Banner[];
}

export type AiReviewStatus = 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** 홈 AI 카드가 쓰는 요약. canRequestAgain이 없으면 false. */
export interface AiReviewSummary {
  status: AiReviewStatus;
  canRequestAgain: boolean;
}
