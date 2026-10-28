import type { RouteValue } from './fixtureRouter';
import { json } from './fixtureRouter';

/** 전시·상세 테스트의 게시물 id. 끝 세 자리(201~227)가 fixture의 번호다. */
export const postId = (n: string | number): string => `22222222-2222-4222-8222-222222222${n}`;
/** 내 게시물(작성자 aaaaaaaa…, 세션 userId와 같다): 목록 isMine, 상세 mine-today, 좋아요 10개. */
export const MINE = postId('201');
/** 남의 게시물: 목록·상세 좋아요 38개, 제목 "은행잎". */
export const OTHER = postId('202');

export const TODAY = '2026-10-27';
export const YESTERDAY = '2026-10-26';
export const FIRST_DATE = '2026-09-17';

export const topicKey = (date: string): string => `GET /topics?date=${date}`;
export const postsKey = (date: string, sort: 'recent' | 'popular' | 'random', page = 1, randomSeed?: string): string =>
  `GET /posts?topicDate=${date}&sort=${sort}&page=${page}&pageSize=20${randomSeed ? `&randomSeed=${randomSeed}` : ''}`;
export const detailKey = (id: string): string => `GET /posts/${id}`;
export const likeKey = (method: 'PUT' | 'DELETE', id: string): string => `${method} /posts/${id}/likes`;
export const titleKey = (id: string): string => `PUT /posts/${id}`;
export const deleteKey = (id: string): string => `DELETE /posts/${id}`;

/** 임의 날짜의 주제 응답(display/topics__*.json과 같은 모양). */
export const topicBody = (date: string, title = '주제') => ({
  id: '11111111-1111-4111-8111-1111111111aa',
  title,
  topicDate: date,
  startsAt: `${date}T00:00:00Z`,
  endsAt: `${date}T23:59:59Z`,
  phase: 'CLOSED',
});

/** 날짜 하나를 읽을 수 있게 하는 라우트(주제 + 해당 정렬 1페이지 fixture). */
export function dateRoutes(date: string, sort: 'recent' | 'popular', postsFixture: string, title = '주제'): Record<string, RouteValue> {
  return {
    [topicKey(date)]: () => json(200, topicBody(date, title)),
    [postsKey(date, sort)]: postsFixture,
  };
}

/** 회원의 전시·상세·좋아요 성공 경로 기본 라우트(오늘 KST 2026-10-27). 테스트가 필요한 키만 router.set으로 바꾼다. */
export const POST_ROUTES: Record<string, RouteValue> = {
  [topicKey(TODAY)]: 'display/topics__open-2026-10-27',
  [topicKey(YESTERDAY)]: 'display/topics__open-2026-10-26',
  [postsKey(TODAY, 'recent')]: 'display/posts-list__recent-page1',
  [postsKey(TODAY, 'recent', 2)]: 'display/posts-list__recent-page2',
  [postsKey(TODAY, 'popular')]: 'display/posts-list__popular-page1',
  [postsKey(TODAY, 'random')]: 'display/posts-list__random-page1-seed',
  [postsKey(TODAY, 'random', 2, 'seed_abc123')]: 'display/posts-list__random-page2',
  [postsKey(YESTERDAY, 'popular')]: 'display/posts-list__popular-page1',
  [detailKey(MINE)]: 'feed/posts-detail__mine-today',
  [detailKey(OTHER)]: 'feed/posts-detail__other',
  [likeKey('PUT', MINE)]: 'like/posts-likes-put__liked',
  [likeKey('DELETE', MINE)]: 'like/posts-likes-delete__unliked',
  [titleKey(MINE)]: 'feed/posts-title-update__200',
  [deleteKey(MINE)]: 'feed/posts-delete__204',
};

/** 게스트: 상세·좋아요·수정·삭제는 라우트가 없다(불리면 연결 실패로 거절되고 호출 기록에 남아 "0건" 단언이 잡는다). 목록은 게스트 fixture. */
export const GUEST_POST_ROUTES: Record<string, RouteValue> = {
  [topicKey(TODAY)]: 'display/topics__open-2026-10-27',
  [topicKey(YESTERDAY)]: 'display/topics__open-2026-10-26',
  [postsKey(TODAY, 'recent')]: 'display/posts-list__guest-page1',
  [postsKey(TODAY, 'popular')]: 'display/posts-list__guest-page1',
  [postsKey(YESTERDAY, 'popular')]: 'display/posts-list__guest-page1',
};

/** 좋아요 응답을 직접 만든다(fixture는 게시물 201 전용이라 다른 게시물·다른 개수에 쓴다). */
export const likeBody = (id: string, likeCount: number, isLiked: boolean) => ({ postId: id, likeCount, isLiked });
