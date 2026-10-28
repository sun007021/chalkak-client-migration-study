import type { KstDate } from '../../core/time/KstDate';

/** 상세에 그리는 내용. 시드나 상세 응답에서 만든다. 시드에는 topicDate·authorId가 없을 수 있다. */
export type FeedContent = {
  postId: string;
  authorId: string | null;
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  signatureOriginalImageUrl: string | null;
  title: string | null;
  /** 상세 응답 전의 시드에는 없다. 날짜 라벨은 이 값이 있을 때만 그린다. */
  topicDate: KstDate | null;
  likeCount: number;
  isLiked: boolean;
};

export type FeedStatus = 'loading' | 'content' | 'not-found' | 'error';

export type TitleDialogState = {
  /** 입력 중인 값(10 code point 상한, 앞뒤 공백 제외). */
  draft: string;
  saving: boolean;
  /** 저장 실패 문구. 다이얼로그는 닫지 않는다. */
  errorMessage: string | null;
};

export type FeedState = {
  status: FeedStatus;
  /** status가 error일 때 보일 문구(feed.error.load / feed.error.invalid / common.error.network). */
  errorMessage: string | null;
  content: FeedContent | null;
  /** 상세 응답을 받아 확정됐는가. 전시 시드는 확정 전까지 좋아요 비활성(REQ-FEED-009). */
  confirmed: boolean;
  isMine: boolean;
  canLike: boolean;
  /** 내 게시물 + 상세 topicDate가 KST 오늘(D-23). */
  canEditTitle: boolean;
  canDelete: boolean;
  titleDialog: TitleDialogState | null;
  deleteDialogOpen: boolean;
  deleting: boolean;
};
