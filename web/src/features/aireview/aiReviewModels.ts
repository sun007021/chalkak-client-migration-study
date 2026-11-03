import type { DateString } from '../../core/time/kst';

/** 서버 status(API §4.2). 알 수 없는 값은 Repository가 InvalidResponseError로 거절한다(REQ-AIR-043). */
export type AiReviewStatus = 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AiCriterion {
  key: string;
  label: string;
  score: number;
}

export interface AiFeedback {
  summary: string;
  strength: string;
  weakness: string;
  suggestion: string;
}

/** COMPLETED일 때만 있다. 점수는 0~10(양 끝 포함), 서버 값을 다시 계산하지 않는다(REQ-AIR-040, 042). */
export interface AiReviewResult {
  overallScore: number;
  criteria: AiCriterion[];
  distinctivePerspective: boolean;
  feedback: AiFeedback;
}

/** GET·POST 응답 본문을 검증해 읽은 값. 시각은 epoch ms(소수초 있는/없는 UTC ISO-8601 모두), 없으면 null. canRequestAgain 필드가 없으면 false(REQ-AIR-033). */
export interface AiReview {
  status: AiReviewStatus;
  requestedAt: number | null;
  completedAt: number | null;
  result: AiReviewResult | null;
  canRequestAgain: boolean;
}

/**
 * 한 게시물의 AI 상태(홈 카드와 상세 알약이 공유, REQ-AIR-050). 저장소가 서버 GET/POST 결과로만 바꾼다.
 * - phase: checking(첫 GET 진행 중 또는 아직 확인 전) / check-failed(첫 GET이 404 외 오류) / hidden(404) / ready(status 확인됨)
 * - status·result·canRequestAgain: ready일 때만 의미가 있다(그 밖에는 null·null·false). 재확인이 실패해도 이전에 확인한 값은 유지한다(REQ-AIR-044).
 * - requesting: POST 응답을 기다리는 중. blocked: POST가 403(정지)으로 거절됐다(같은 요청을 다시 보내지 않는다).
 * - stalled: 폴링 창 300초가 끝났는데도 PROCESSING(ProcessingStalled). polling: 지금 폴링 루프가 돌고 있다(보이는 화면이 있고 PROCESSING이며 창 안).
 */
export interface AiReviewEntry {
  postId: string;
  phase: 'checking' | 'check-failed' | 'hidden' | 'ready';
  status: AiReviewStatus | null;
  canRequestAgain: boolean;
  result: AiReviewResult | null;
  requesting: boolean;
  blocked: boolean;
  stalled: boolean;
  polling: boolean;
}

/** 상세 알약 종류. hidden이면 알약이 DOM에 없다. */
export type AiPillKind = 'hidden' | 'checking' | 'recheck' | 'request' | 'requesting' | 'processing' | 'view' | 'retry' | 'failed';

/** 알약 판정 입력. topicDate는 상세 응답 전(시드)에는 null이다. */
export interface AiPillInput {
  entry: AiReviewEntry | null;
  isMine: boolean;
  topicDate: DateString | null;
  today: DateString;
}

/** 실패 시트의 이유 문구 종류: no-more(`ai.failed.no-more`), past(`ai.failed.past`), none(이유 문구 없음). */
export type AiFailedReason = 'no-more' | 'past' | 'none';

/** 상세 AI 영역의 시트. start.retry가 true면 재요청 시트(제목 `ai.start.title-retry`). */
export type AiSheet =
  | { kind: 'none' }
  | { kind: 'start'; retry: boolean }
  | { kind: 'result'; result: AiReviewResult }
  | { kind: 'failed'; reason: AiFailedReason; canRetry: boolean };

export interface FeedAiState {
  pill: AiPillKind;
  /** 폴링 창 종료 안내(`ai.poll.timeout`)를 `feed.ai-message`로 보인다. */
  stalled: boolean;
  /** 알약이 "AI 상태 다시 확인"이거나 창 종료 뒤이면 `feed.ai-recheck-button`이 있다. */
  recheckVisible: boolean;
  sheet: AiSheet;
  /** 결과 시트 위의 기준 설명 다이얼로그. */
  criteriaOpen: boolean;
}
