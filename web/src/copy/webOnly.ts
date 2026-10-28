/**
 * Web에만 있는 문구(shared/copy/ko.json에 키가 없는 것). shared에 키가 생기면 그쪽으로 옮기고 이 파일에서 뺀다.
 * 홈 새로고침 버튼은 모바일의 당겨서 새로고침에 해당하는 Web 대체 수단이다(home.md 새로고침 방식).
 */
export const webOnlyCopy = {
  'home.refresh': '새로고침',
  /** 어제 랭킹·오늘 인기 섹션의 전시 이동 링크(shared의 home.weekly.more는 "보러가기"로 이번 주 기록 전용). */
  'home.ranking.more': '더 보기',
} as const;

export type WebOnlyCopyKey = keyof typeof webOnlyCopy;
