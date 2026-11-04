import type { DateString } from '../../core/time/kst';
import type { AiPillInput, AiReviewEntry } from './aiReviewModels';
import { readOpenAiReview } from './aiEntry';
import { canRequestAi, deriveAiPill, failedSheetReason } from './aiPill';

const TODAY = '2026-10-27' as DateString;
const PAST = '2026-10-20' as DateString;

const entry = (patch: Partial<AiReviewEntry> = {}): AiReviewEntry => ({
  postId: 'p1',
  phase: 'ready',
  status: 'NONE',
  canRequestAgain: false,
  result: null,
  requesting: false,
  blocked: false,
  stalled: false,
  polling: false,
  ...patch,
});
const input = (patch: Partial<AiPillInput> = {}): AiPillInput => ({ entry: entry(), isMine: true, topicDate: TODAY, today: TODAY, ...patch });

describe('canRequestAi (REQ-AIR-003)', () => {
  it('TC-AIR-016 TC-AIR-045 내 게시물이고 주제 날짜가 KST 오늘일 때만 true다', () => {
    expect(canRequestAi({ isMine: true, topicDate: TODAY, today: TODAY })).toBe(true);
    expect(canRequestAi({ isMine: true, topicDate: PAST, today: TODAY })).toBe(false);
    expect(canRequestAi({ isMine: false, topicDate: TODAY, today: TODAY })).toBe(false);
    expect(canRequestAi({ isMine: true, topicDate: null, today: TODAY })).toBe(false);
    expect(canRequestAi({ isMine: true, topicDate: TODAY, today: '2026-10-28' as DateString })).toBe(false);
  });
});

describe('deriveAiPill 알약 상태 표 (REQ-AIR-008 ~ 016)', () => {
  it('TC-AIR-017 REQ-AIR-001 내 게시물이 아니거나 저장소가 아직 붙지 않았으면 알약이 없다', () => {
    expect(deriveAiPill(input({ isMine: false }))).toBe('hidden');
    expect(deriveAiPill(input({ isMine: false, entry: entry({ status: 'COMPLETED' }) }))).toBe('hidden');
    expect(deriveAiPill(input({ entry: null }))).toBe('hidden');
  });

  it('REQ-AIR-008 REQ-AIR-016 REQ-AIR-005 첫 GET 진행 중은 checking, 첫 GET 실패는 recheck, 404는 hidden이다', () => {
    expect(deriveAiPill(input({ entry: entry({ phase: 'checking', status: null }) }))).toBe('checking');
    expect(deriveAiPill(input({ entry: entry({ phase: 'check-failed', status: null }) }))).toBe('recheck');
    expect(deriveAiPill(input({ entry: entry({ phase: 'hidden', status: null }) }))).toBe('hidden');
  });

  it('TC-AIR-012 REQ-AIR-009 NONE + 오늘이면 request다', () => {
    expect(deriveAiPill(input())).toBe('request');
  });

  it('TC-AIR-013 REQ-AIR-011 PROCESSING은 processing이고 창이 끝나(stalled) 안내가 나와도 유지한다(REQ-AIR-027)', () => {
    expect(deriveAiPill(input({ entry: entry({ status: 'PROCESSING', polling: true }) }))).toBe('processing');
    expect(deriveAiPill(input({ entry: entry({ status: 'PROCESSING', stalled: true }) }))).toBe('processing');
  });

  it('REQ-AIR-010 POST 진행 중에는 requesting이다(NONE·FAILED 어디서든)', () => {
    expect(deriveAiPill(input({ entry: entry({ requesting: true }) }))).toBe('requesting');
    expect(deriveAiPill(input({ entry: entry({ status: 'FAILED', canRequestAgain: true, requesting: true }) }))).toBe('requesting');
  });

  it('TC-AIR-014 REQ-AIR-012 COMPLETED는 view다(지난 주제여도)', () => {
    expect(deriveAiPill(input({ entry: entry({ status: 'COMPLETED' }) }))).toBe('view');
    expect(deriveAiPill(input({ entry: entry({ status: 'COMPLETED' }), topicDate: PAST }))).toBe('view');
  });

  it('TC-AIR-015 REQ-AIR-013 REQ-AIR-014 FAILED: 재요청 가능 + 오늘이면 retry, 아니면 failed다', () => {
    expect(deriveAiPill(input({ entry: entry({ status: 'FAILED', canRequestAgain: true }) }))).toBe('retry');
    expect(deriveAiPill(input({ entry: entry({ status: 'FAILED', canRequestAgain: false }) }))).toBe('failed');
  });

  it('TC-AIR-016 REQ-AIR-004 지난 주제: NONE은 hidden, PROCESSING·COMPLETED는 그대로, FAILED는 재요청 가능해도 failed다', () => {
    const past = (patch: Partial<AiReviewEntry>) => deriveAiPill(input({ topicDate: PAST, entry: entry(patch) }));
    expect(past({ status: 'NONE' })).toBe('hidden');
    expect(past({ status: 'PROCESSING' })).toBe('processing');
    expect(past({ status: 'COMPLETED' })).toBe('view');
    expect(past({ status: 'FAILED', canRequestAgain: true })).toBe('failed');
  });

  it('TC-AIR-045 REQ-AIR-003 오늘이던 NONE이 자정을 지나면(today가 바뀌면) request에서 hidden으로 바뀐다', () => {
    expect(deriveAiPill(input({ today: TODAY }))).toBe('request');
    expect(deriveAiPill(input({ today: '2026-10-28' as DateString }))).toBe('hidden');
  });

  it('상세 응답 전(topicDate null)의 NONE은 자격을 알 수 없으므로 hidden이고 PROCESSING·COMPLETED는 그대로 보인다', () => {
    expect(deriveAiPill(input({ topicDate: null }))).toBe('hidden');
    expect(deriveAiPill(input({ topicDate: null, entry: entry({ status: 'COMPLETED' }) }))).toBe('view');
  });
});

describe('failedSheetReason (REQ-AIR-015)', () => {
  const reason = (patch: Partial<AiReviewEntry>, topicDate: DateString = TODAY) => failedSheetReason({ entry: entry({ status: 'FAILED', ...patch }), topicDate, today: TODAY });

  it('TC-AIR-015 canRequestAgain=false면 no-more, 지난 주제의 재요청 가능 사진이면 past, 재요청 가능 + 오늘이면 이유 문구가 없다', () => {
    expect(reason({ canRequestAgain: false })).toBe('no-more');
    expect(reason({ canRequestAgain: true }, PAST)).toBe('past');
    expect(reason({ canRequestAgain: true })).toBe('none');
  });

  it('TC-AIR-016 (임시) 지난 주제 + canRequestAgain=false는 서버 값이 먼저라 no-more다', () => {
    expect(reason({ canRequestAgain: false }, PAST)).toBe('no-more');
  });
});

describe('readOpenAiReview (홈 자세히 보기 이동 인자)', () => {
  it('REQ-AIR-047 REQ-HOME-035 정확히 { openAiReview: true }일 때만 true다(웹은 푸시가 없어 홈 이동만 이 값을 만든다)', () => {
    expect(readOpenAiReview({ openAiReview: true })).toBe(true);
    expect(readOpenAiReview({ openAiReview: true, seed: {} })).toBe(true);
    expect(readOpenAiReview({ openAiReview: 'true' })).toBe(false);
    expect(readOpenAiReview({ openAiReview: false })).toBe(false);
    expect(readOpenAiReview({})).toBe(false);
    expect(readOpenAiReview(null)).toBe(false);
    expect(readOpenAiReview('openAiReview')).toBe(false);
  });
});
