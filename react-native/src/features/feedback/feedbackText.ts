import { FEEDBACK_MAX, FEEDBACK_MIN } from '../../shared/constants';

/** 서버로 보내는 값: 앞뒤 공백만 제거하고 중간 공백은 보존한다(REQ-FDBK-007). 정규화는 하지 않는다. */
export function trimFeedback(text: string): string {
  return text.trim();
}

/** 앞뒤 공백을 뺀 뒤 Unicode code point 수(grapheme가 아님, REQ-FDBK-003). */
export function feedbackLength(text: string): number {
  const trimmed = trimFeedback(text);
  // 문자열 spread는 code point 단위로 나눈다.
  return [...trimmed].length;
}

export type FeedbackValidation = 'empty' | 'ok' | 'too-long';

export function validateFeedback(text: string, max: number = FEEDBACK_MAX): FeedbackValidation {
  const length = feedbackLength(text);
  if (length < FEEDBACK_MIN) return 'empty';
  return length > max ? 'too-long' : 'ok';
}
