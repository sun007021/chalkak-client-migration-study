/** 제목 입력 규칙(D-01): 앞뒤 공백 제거 후 Unicode code point 10개까지. */
import { POST_TITLE_MAX } from '../../shared/constants';

const codePointCount = (text: string): number => Array.from(text).length;

/** 앞뒤 공백을 제거한 제목의 code point 수. */
export function titleLength(text: string): number {
  return codePointCount(text.trim());
}

/**
 * 입력값을 규칙에 맞게 자른다. 제거 후 10 code point 이하면 그대로, 넘으면 앞쪽 10 code point만 남긴다
 * (11번째 입력은 들어가지 않고 붙여넣기는 10까지만 받는다).
 */
export function clampTitle(text: string): string {
  if (titleLength(text) <= POST_TITLE_MAX) return text;
  return Array.from(text.trim()).slice(0, POST_TITLE_MAX).join('');
}

/** POST /posts의 title: 앞뒤 공백을 제거한 값, 비었거나 공백뿐이면 null. */
export function titleForRequest(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}
