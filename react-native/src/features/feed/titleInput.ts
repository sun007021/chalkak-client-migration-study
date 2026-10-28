/** Unicode code point 수(앞뒤 공백 제거 뒤, D-01). 결합 이모지는 구성 code point 수만큼 센다. */
export function countTitleLength(_text: string): number {
  throw new Error('not implemented');
}

/**
 * 입력 변경을 반영한다. 제거 후 10 code point 이하면 next 그대로, 초과면 한 글자씩 치는 입력은 막아 previous를 돌려주고
 * 여러 글자 붙여넣기는 10 code point까지만 받는다.
 */
export function limitTitleInput(_previous: string, _next: string): string {
  throw new Error('not implemented');
}

/** 요청에 보낼 값: 앞뒤 공백을 제거하고, 비면 null(키는 보내되 값이 null). */
export function titleForRequest(_text: string): string | null {
  throw new Error('not implemented');
}
