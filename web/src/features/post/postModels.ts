import type { DateString } from '../../core/time/kst';
import type { PostSummary } from '../home/homeModels';

/** 좋아요 상태(화면이 보여 주는 값). */
export interface LikeValue {
  isLiked: boolean;
  likeCount: number;
}

/** 좋아요 값을 가진 게시물(목록 항목·상세·시드 공통). */
export interface LikeTarget extends LikeValue {
  id: string;
}

/** GET /posts 목록 항목(API §1.3). 홈 랭킹의 PostSummary에 사인 URL이 더해진다. 필수 필드가 없거나 likeCount가 음수면 응답 전체가 InvalidResponseError. */
export interface PostItem extends PostSummary {
  signatureOriginalImageUrl: string | null;
  signatureThumbnailImageUrl: string | null;
}

/**
 * 상세로 넘기는 시드(location.state.seed). 홈 랭킹은 PostSummary 그대로라 사인 URL이 없다.
 * 시드는 상세 응답 전에 이미지·좋아요·제목을 보여 주는 용도이고 상세 응답이 확정되면 응답이 우선한다.
 */
export type PostSeed = PostSummary & { signatureOriginalImageUrl?: string | null };

/** GET /posts/{postId} 응답(API §1.3). isMine은 없다(D-26: authorId == 저장된 userId로 판정). */
export interface PostDetail {
  id: string;
  authorId: string;
  topic: { id: string; title: string; topicDate: DateString };
  originalImageUrl: string;
  thumbnailImageUrl: string | null;
  signatureOriginalImageUrl: string | null;
  title: string | null;
  likeCount: number;
  isLiked: boolean;
}

/** 게시물 변경 이벤트. 화면들이 구독해 목록·캐시·상세를 같은 값으로 맞춘다. */
export type PostChange =
  | { type: 'like'; postId: string; isLiked: boolean; likeCount: number }
  | { type: 'title'; postId: string; title: string | null }
  /** 삭제·비공개(404). 구독자는 목록·캐시에서 뺀다. */
  | { type: 'removed'; postId: string }
  /**
   * 업로드 성공(201 또는 복구 확인, REQ-UPL-063). 홈은 히어로를 곧바로 이 상태로 바꾸고(VALIDATING → 처리 중, PENDING → 검수 대기),
   * 전시는 그 topicDate의 목록 캐시를 버리고 보고 있으면 조용히 다시 불러온다.
   */
  | { type: 'created'; postId: string; topicDate: DateString; moderationStatus: 'VALIDATING' | 'PENDING' | 'APPROVED' };
