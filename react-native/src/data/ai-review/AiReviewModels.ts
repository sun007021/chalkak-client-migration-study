export type AiReviewStatus = 'NONE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export type AiReviewCriterion = { key: string; label: string; score: number };

export type AiReviewResult = {
  /** 서버 값 그대로(0~10). 다시 계산하지 않는다. */
  overallScore: number;
  criteria: AiReviewCriterion[];
  distinctivePerspective: boolean;
  feedback: { summary: string; strength: string; weakness: string; suggestion: string };
};

export type AiReview = {
  status: AiReviewStatus;
  requestedAt: Date | null;
  completedAt: Date | null;
  /** COMPLETED일 때만 있다. */
  result: AiReviewResult | null;
  /** 필드가 없으면 false. 요청 횟수는 클라이언트가 세지 않는다(REQ-AIR-033). */
  canRequestAgain: boolean;
};
