/** 제목 최대 길이(D-01): 앞뒤 공백을 제거한 Unicode code point 수. */
const MAX_TITLE_CODE_POINTS = 10;

const codePoints = (text: string): string[] => Array.from(text);

/** Unicode code point 수(앞뒤 공백 제거 뒤, D-01). 결합 이모지는 구성 code point 수만큼 센다. */
export function countTitleLength(text: string): number {
  return codePoints(text.trim()).length;
}

/**
 * 입력 변경을 반영한다. 제거 후 10 code point 이하면 next 그대로, 초과면 한 글자씩 치는 입력은 막아 previous를 돌려주고
 * 여러 글자 붙여넣기는 10 code point까지만 받는다.
 */
export function limitTitleInput(previous: string, next: string): string {
  if (countTitleLength(next) <= MAX_TITLE_CODE_POINTS) return next;
  const added = codePoints(next).length - codePoints(previous).length;
  if (added <= 1) return previous;
  const kept = codePoints(next);
  while (kept.length > 0 && countTitleLength(kept.join('')) > MAX_TITLE_CODE_POINTS) kept.pop();
  return kept.join('');
}

/** 요청에 보낼 값: 앞뒤 공백을 제거하고, 비면 null(키는 보내되 값이 null). */
export function titleForRequest(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}
