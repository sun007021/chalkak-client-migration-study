export type AiPillKind =
  'checking' | 'request' | 'requesting' | 'processing' | 'view' | 'retry' | 'failed' | 'recheck';

export type AiPill = { kind: AiPillKind; label: string; enabled: boolean };

export type AiResultSheet = {
  kind: 'result';
  /** 소수 첫째 자리(7.5, 10.0, 0.0). 서버 값을 다시 계산하지 않는다. */
  scoreText: string;
  scoreA11yLabel: string;
  summary: string;
  criteria: { key: string; label: string; scoreText: string }[];
  /** distinctivePerspective가 true일 때만 문구가 있다. */
  distinctiveBadge: string | null;
  sections: { key: 'strength' | 'weakness' | 'suggestion'; title: string; body: string }[];
};

export type AiStartSheet = {
  kind: 'start';
  /** 재요청 시트인가. */
  retry: boolean;
  title: string;
  lines: string[];
  confirmLabel: string;
};

export type AiFailedSheet = {
  kind: 'failed';
  title: string;
  /** 재요청할 수 없는 이유: canRequestAgain=false면 "더 이상", 지난 주제의 사진이면 "오늘 올린 사진만". 재요청할 수 있으면 null. */
  reason: string | null;
  /** canRequestAgain=true이고 오늘 주제의 사진일 때만 재요청 버튼을 보인다. */
  canRetry: boolean;
  confirmLabel: string;
};

export type AiSheet = AiStartSheet | AiResultSheet | AiFailedSheet;

/** 홈 카드(문구와 버튼 하나). 카드가 없으면 null. */
export type AiCard = {
  message: string;
  action: { kind: 'start' | 'detail' | 'retry'; label: string } | null;
};

export type AiReviewViewState = {
  /** 상세의 알약. 보이지 않으면 null. */
  pill: AiPill | null;
  /** 폴링 창이 끝났을 때의 안내와 "AI 상태 다시 확인" 진입. */
  notice: { message: string; canRecheck: boolean } | null;
  sheet: AiSheet | null;
  criteriaDialogOpen: boolean;
  card: AiCard | null;
};
