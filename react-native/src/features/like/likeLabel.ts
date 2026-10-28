/**
 * 하트 버튼의 접근성 라벨 "좋아요 N개".
 * shared/copy/ko.json에 키가 없어 화면이 직접 조립한다(문구 키가 생기면 t()로 바꾼다).
 */
export const LIKE_COUNT_LABEL = '좋아요 {n}개';

export function likeAccessibilityLabel(count: number): string {
  return LIKE_COUNT_LABEL.replace('{n}', String(count));
}
