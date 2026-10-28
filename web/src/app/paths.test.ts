import { ROUTES, displayPath, feedPath, recordPath } from './paths';

describe('홈 이동 경로 계약 (전시·기록·피드·알림함 화면은 다음 PR)', () => {
  it('TC-HOME-023 전시 탭은 날짜와 정렬을 쿼리로 받는다', () => {
    expect(displayPath('2026-10-26', 'popular')).toBe('/display?date=2026-10-26&sort=popular');
    expect(displayPath('2026-10-27', 'popular')).toBe('/display?date=2026-10-27&sort=popular');
  });

  it('TC-HOME-031 기록 탭은 선택 날짜를 쿼리로 받고 날짜가 없으면 쿼리가 없다', () => {
    expect(recordPath('2026-09-29')).toBe('/record?date=2026-09-29');
    expect(recordPath(null)).toBe('/record');
  });

  it('TC-HOME-021 게시물 상세는 /feed/{postId}이고 알림함은 /notifications이다', () => {
    expect(feedPath('22222222-2222-4222-8222-222222222202')).toBe('/feed/22222222-2222-4222-8222-222222222202');
    expect(ROUTES.notifications).toBe('/notifications');
    expect(ROUTES.feed).toBe('/feed');
  });
});
