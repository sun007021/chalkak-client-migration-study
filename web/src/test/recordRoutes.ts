import type { RouteValue } from './fixtureRouter';
import { json } from './fixtureRouter';

/** 기록 테스트의 게시물 id. 끝 세 자리가 fixture 번호다(record/posts-calendar__*.json). */
export const recPostId = (n: string | number): string => `22222222-2222-4222-8222-222222222${n}`;
/** 2026-10-20 APPROVED, 2026-10-27 PENDING, 2026-10-31 APPROVED. */
export const OCT_20 = recPostId(290);
export const OCT_27 = recPostId(201);
export const OCT_31 = recPostId(291);
/** 2026-09-17, 2026-09-30 (둘 다 APPROVED). */
export const SEP_17 = recPostId(297);
export const SEP_30 = recPostId(296);

export const MONTHS_KEY = 'GET /posts/calendar/months';
export const calendarKey = (year: number, month: number): string => `GET /posts/calendar?year=${year}&month=${month}`;
export const OCT = calendarKey(2026, 10);
export const SEP = calendarKey(2026, 9);
export const AUG = calendarKey(2026, 8);
export const NOV = calendarKey(2026, 11);

/** 월 목록 응답을 직접 만든다. */
export const monthsBody = (...months: [number, number][]) => ({ months: months.map(([year, month]) => ({ year, month })) });
/** 월 응답을 직접 만든다(posts: [topicDate, postId, status]). */
export const monthBody = (year: number, month: number, posts: [string, string, 'PENDING' | 'APPROVED'][] = []) => ({
  year,
  month,
  posts: posts.map(([topicDate, postId, status]) => ({ topicDate, postId, thumbnailImageUrl: `https://cdn.example.test/posts/${postId}/thumbnail.webp`, status })),
});
export const thumbOf = (postId: string): string => `https://cdn.example.test/posts/${postId}/thumbnail.webp`;
export const monthResponse = (year: number, month: number, posts: [string, string, 'PENDING' | 'APPROVED'][] = []) => () => json(200, monthBody(year, month, posts));

/** 회원의 기록 성공 경로 기본 라우트(오늘 KST 2026-10-27). 테스트가 필요한 키만 router.set으로 바꾼다. */
export const RECORD_ROUTES: Record<string, RouteValue> = {
  [MONTHS_KEY]: 'record/posts-calendar-months__recent-first',
  [OCT]: 'record/posts-calendar__2026-10',
  [SEP]: 'record/posts-calendar__2026-09',
};

/** 게스트: 기록 API 라우트가 없다(불리면 연결 실패로 거절되고 호출 기록에 남아 "0건" 단언이 잡는다). */
export const GUEST_RECORD_ROUTES: Record<string, RouteValue> = {};

/** 기록 API 요청(월 목록 + 월별 달력)만 'path?query' 문자열로. */
export const recordRequests = (calls: readonly { path: string; query: URLSearchParams }[]): string[] =>
  calls.filter((c) => c.path.startsWith('/posts/calendar')).map((c) => `${c.path}${c.query.size ? `?${c.query.toString()}` : ''}`);
