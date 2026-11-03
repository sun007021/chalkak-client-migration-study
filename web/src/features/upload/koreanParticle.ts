/**
 * 목적격 조사(REQ-UPL-060, TC-UPL-084). 끝의 공백을 무시하고 마지막 글자가 받침 있는 한글 음절이면 '을', 받침이 없는 한글 음절이거나 한글이 아니거나 비어 있으면 '를'.
 * 예: 하늘·꽃·우산·"겨울 " → 을, 바다·나무·"" · "abc" · "123" → 를.
 */
export function objectParticle(word: string): '을' | '를' {
  const last = Array.from(word.trimEnd()).pop();
  if (last === undefined) return '를';
  const code = last.codePointAt(0)!;
  if (code < 0xac00 || code > 0xd7a3) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}
