import type { AiFailedReason, AiPillInput, AiPillKind } from './aiReviewModels';

/** 요청·재요청 자격(REQ-AIR-003): 내 게시물이고 상세의 topicDate가 KST 오늘. topicDate가 아직 없으면 false. */
export function canRequestAi(_input: Pick<AiPillInput, 'isMine' | 'topicDate' | 'today'>): boolean {
  throw new Error('not implemented');
}

/**
 * 저장소 상태와 자격에서 알약 종류를 정한다(상태 표 기준).
 * 내 게시물이 아니거나 entry가 null이면 hidden. phase: checking→checking, check-failed→recheck, hidden→hidden.
 * ready: requesting이면 requesting(NONE·FAILED 어디서든), NONE→request(자격 있을 때, 지난 주제는 hidden), PROCESSING→processing(stalled여도 유지),
 * COMPLETED→view, FAILED→canRequestAgain && 자격 → retry, 아니면 failed.
 */
export function deriveAiPill(_input: AiPillInput): AiPillKind {
  throw new Error('not implemented');
}

/**
 * 실패 시트의 이유 문구 종류. canRequestAgain=false → no-more(지난 주제여도 서버 값이 먼저, 임시), 지난 주제 → past, 재요청 가능 + 오늘 → none.
 */
export function failedSheetReason(_input: Pick<AiPillInput, 'entry' | 'topicDate' | 'today'>): AiFailedReason {
  throw new Error('not implemented');
}
