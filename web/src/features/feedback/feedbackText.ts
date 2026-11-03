import { FEEDBACK_MAX } from '../../constants';

export type FeedbackValidity = 'empty' | 'ok' | 'too-long';

/** 앞뒤 공백(스페이스·탭·개행·전각 공백 U+3000 등)만 제거한다. 가운데는 그대로(REQ-FDBK-003, 007). */
export function trimFeedback(raw: string): string {
  return raw.trim();
}

/** trim 뒤 Unicode code point 수(grapheme·UTF-16 단위가 아니고 정규화하지 않는다, FEEDBACK-002). */
export function feedbackLength(raw: string): number {
  return [...trimFeedback(raw)].length;
}

/** 0 -> 'empty', 1~FEEDBACK_MAX -> 'ok', 초과 -> 'too-long'. */
export function validateFeedback(raw: string): FeedbackValidity {
  const length = feedbackLength(raw);
  if (length === 0) return 'empty';
  return length > FEEDBACK_MAX ? 'too-long' : 'ok';
}
