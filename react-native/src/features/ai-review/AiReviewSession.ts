import type { AiReview } from '../../data/ai-review/AiReviewModels';
import type { AiReviewPoller } from './AiReviewPoller';

/**
 * 폴러가 보관하는 게시물 하나의 AI 피드백 상태.
 * phase: idle 대상 없음 / checking GET 진행 중 / check-failed 첫 GET 실패 / hidden 404 / ready 확인됨.
 */
export type AiReviewState = {
  postId: string | null;
  phase: 'idle' | 'checking' | 'check-failed' | 'hidden' | 'ready';
  /** POST 응답을 기다리는 중. */
  requesting: boolean;
  /** 마지막으로 확인한 상태. checking 중에도 같은 게시물이면 유지한다. */
  review: AiReview | null;
  /** PROCESSING인데 300초 창이 끝나 폴링을 멈췄다(실패가 아니다). */
  stalled: boolean;
};

/** 화면(ViewModel)이 쓰는 폴러의 전체 면. 홈은 start/stop만 안다. */
export interface AiReviewSession extends AiReviewPoller {
  getSnapshot(): Readonly<AiReviewState>;
  subscribe(listener: () => void): () => void;
  /** 같은 게시물이어도 항상 GET부터 확인하고 새 창을 연다(상세 재진입, 다시 확인). */
  refresh(postId: string, owner?: object): void;
  /** 사용자가 확정한 POST. 진행 중이면 무시한다. 오류는 토스트/인증 정책으로 처리하고 던지지 않는다. */
  request(postId: string, owner?: object): Promise<void>;
}
