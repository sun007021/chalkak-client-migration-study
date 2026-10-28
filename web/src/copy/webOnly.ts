/**
 * Web에만 있는 문구(shared/copy/ko.json에 키가 없는 것). shared에 키가 생기면 그쪽으로 옮기고 이 파일에서 뺀다.
 * 홈 새로고침 버튼은 모바일의 당겨서 새로고침에 해당하는 Web 대체 수단이다(home.md 새로고침 방식).
 */
export const webOnlyCopy = {
  'home.refresh': '새로고침',
  /** 홈 새로고침 중 표시(home.refresh-indicator)의 텍스트. */
  'home.refresh-indicator': '새로고침 중',
  /** 어제 랭킹·오늘 인기 섹션의 전시 이동 링크. 접근성 이름은 "섹션 제목 더보기". */
  'home.ranking.more': '더보기',
  /** 제목이 없는 랭킹 사진의 대체 텍스트(제목이 있으면 이미지는 장식). */
  'home.ranking.photo-alt': '사진',
  /** 주간 칸의 접근성 이름: "10월 27일 화요일". 요일 글자는 record.weekday에서 온다. */
  'home.week.weekday-suffix': '요일',
  /** 배너를 더 불러오는 중(목록 끝)과 추가 페이지 실패 안내. */
  'home.banner.loading-more': '불러오는 중',
  'home.banner.more-error': '더 불러오지 못했어요',
  /** 좋아요 버튼의 접근성 이름. {n}은 좋아요 수. 눌림 상태는 aria-pressed로 노출한다(TC-LIKE-034, 임시). */
  'like.a11y': '좋아요 {n}개',
} as const;

export type WebOnlyCopyKey = keyof typeof webOnlyCopy;
