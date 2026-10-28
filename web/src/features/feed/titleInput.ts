import { POST_TITLE_MAX } from '../../constants';

/** Unicode code point 수(결합 이모지는 구성 code point 수만큼, D-01). */
export function countCodePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/**
 * 제목 입력 상한(REQ-FEED-018): 앞뒤 공백을 제거한 뒤 code point가 POST_TITLE_MAX(10)를 넘으면 넘는 뒤쪽을 잘라낸다
 * (타이핑한 11번째 글자는 들어가지 않고 붙여넣기는 10 code point까지만 들어간다). 앞뒤 공백 자체는 길이에 넣지 않으므로 " 가나다라마바사아자차 "는 그대로 둔다.
 */
export function clampTitleInput(text: string): string {
  const lead = text.length - text.trimStart().length;
  const body = text.trim();
  if (countCodePoints(body) <= POST_TITLE_MAX) return text;
  const kept = [...body].slice(0, POST_TITLE_MAX).join('');
  return text.slice(0, lead) + kept;
}

/** PUT /posts/{id}의 title: 앞뒤 공백을 제거한 문자열, 공백뿐이거나 비면 null(키는 항상 보낸다, REQ-FEED-020). */
export function titlePayload(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}
