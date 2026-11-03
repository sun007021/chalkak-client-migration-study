import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { json } from '../../test/fixtureRouter';
import { guestSession, loadFixture, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import type { StoredSession } from '../../core/auth/SessionStore';
import { DisplayRepository } from './DisplayRepository';

function setup(session: StoredSession = memberSession()) {
  const env = makeApiEnv(session);
  const repo = new DisplayRepository({ api: env.client() });
  const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    await env.clock.advance(5_000);
    return result;
  };
  return { ...env, repo, respond, settled };
}

const query = (call: { query: URLSearchParams }) => Object.fromEntries(call.query.entries());
const rawPost = (overrides: Record<string, unknown> = {}) => ({
  id: '22222222-2222-4222-8222-222222222202',
  authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalImageUrl: 'https://cdn.example.test/posts/x/original.webp',
  thumbnailImageUrl: 'https://cdn.example.test/posts/x/thumbnail.webp',
  signatureOriginalImageUrl: 'https://cdn.example.test/signatures/b/original.png',
  signatureThumbnailImageUrl: 'https://cdn.example.test/signatures/b/thumbnail.png',
  title: '은행잎',
  likeCount: 3,
  isLiked: false,
  isMine: false,
  ...overrides,
});
const page = (posts: unknown[], extra: Record<string, unknown> = {}) => ({ currentPage: 1, pageSize: 20, hasNext: false, randomSeed: null, posts, ...extra });

describe('DisplayRepository.fetchTopic (GET /topics)', () => {
  it('TC-DISP-002 ?date=로 부르고 주제를 값으로 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('display/topics__open-2026-10-27'));
    const topic = await h.repo.fetchTopic('2026-10-27');
    expect(query(h.ff.calls[0]!)).toEqual({ date: '2026-10-27' });
    expect(topic).toMatchObject({ title: '가을 하늘', topicDate: '2026-10-27', phase: 'OPEN' });
  });

  it('TC-DISP-006 404 BUSINESS_ERROR는 오류가 아니라 null이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('display/topics__404-not-found'));
    await expect(h.repo.fetchTopic('2026-10-27')).resolves.toBeNull();
    expect(h.ff.calls).toHaveLength(1);
  });

  it('REQ-DISP-002 응답 topicDate가 요청 날짜와 다르면 잘못된 응답이다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('display/topics__open-2026-10-26'));
    await expect(h.repo.fetchTopic('2026-10-27')).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-DISP-009 phase가 BEFORE_OPEN이어도 주제로 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /topics', () => json(200, { ...(loadFixture('display/topics__before-open.json').json as object), topicDate: '2026-10-27' }));
    await expect(h.repo.fetchTopic('2026-10-27')).resolves.toMatchObject({ phase: 'BEFORE_OPEN' });
  });

  it('TC-DISP-005 500은 ApiError(500)로 재시도(0.5초, 1초) 뒤 던진다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('display/topics__500-server-error'));
    const result = await h.settled(h.repo.fetchTopic('2026-10-27'));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-DISP-004 게스트는 Authorization 없이, 회원은 토큰과 함께 부른다', async () => {
    const guest = setup(guestSession);
    guest.ff.route('GET /topics', guest.respond('display/topics__open-2026-10-27'));
    await guest.repo.fetchTopic('2026-10-27');
    expect(guest.ff.calls[0]!.headers['authorization']).toBeUndefined();
    const member = setup();
    member.ff.route('GET /topics', member.respond('display/topics__open-2026-10-27'));
    await member.repo.fetchTopic('2026-10-27');
    expect(member.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });
});

describe('DisplayRepository.fetchPosts (GET /posts)', () => {
  it('TC-DISP-002 topicDate·sort·page·pageSize=20을 보내고 사진 4종 URL과 likeCount·isLiked·isMine·title을 매핑한다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__recent-page1'));
    const result = await h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 });
    expect(query(h.ff.calls[0]!)).toEqual({ topicDate: '2026-10-27', sort: 'recent', page: '1', pageSize: '20' });
    expect(result).toMatchObject({ currentPage: 1, pageSize: 20, hasNext: true, randomSeed: null });
    expect(result!.posts).toHaveLength(20);
    expect(result!.posts[0]).toEqual({
      id: '22222222-2222-4222-8222-222222222202',
      authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      originalImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/original.webp',
      thumbnailImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/thumbnail.webp',
      signatureOriginalImageUrl: 'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.png',
      signatureThumbnailImageUrl: 'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/thumbnail.png',
      title: '은행잎',
      likeCount: 38,
      isLiked: false,
      isMine: false,
    });
    const mine = result!.posts.find((p) => p.id.endsWith('201'));
    expect(mine).toMatchObject({ isMine: true, authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', likeCount: 10 });
    expect(result!.posts.find((p) => p.id.endsWith('203'))).toMatchObject({ isLiked: true, likeCount: 37 });
  });

  it.each([
    ['recent', 1, undefined, { sort: 'recent', page: '1' }],
    ['popular', 3, undefined, { sort: 'popular', page: '3' }],
    ['random', 1, undefined, { sort: 'random', page: '1' }],
    ['random', 2, 'seed_abc123', { sort: 'random', page: '2', randomSeed: 'seed_abc123' }],
    ['random', 1, 'seed_abc123', { sort: 'random', page: '1', randomSeed: 'seed_abc123' }],
    ['random', 2, 'A'.repeat(64), { sort: 'random', page: '2', randomSeed: 'A'.repeat(64) }],
    ['random', 2, 'a-B_9', { sort: 'random', page: '2', randomSeed: 'a-B_9' }],
  ] as const)('TC-DISP-003 sort=%s page=%i randomSeed=%s → 쿼리가 소문자 sort, pageSize=20, 허용된 시드만 붙는다', async (sort, page, randomSeed, expected) => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, page_(1)));
    await h.repo.fetchPosts({ topicDate: '2026-10-27', sort, page, randomSeed });
    expect(query(h.ff.calls[0]!)).toEqual({ topicDate: '2026-10-27', pageSize: '20', ...expected });
  });

  it.each([
    ['recent', 'seed_abc123'],
    ['popular', 'seed_abc123'],
  ] as const)('TC-DISP-018 F5 %s 정렬에는 시드가 주어져도 보내지 않는다', async (sort, randomSeed) => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, page_(1)));
    await h.repo.fetchPosts({ topicDate: '2026-10-27', sort, page: 1, randomSeed });
    expect(h.ff.calls[0]!.query.has('randomSeed')).toBe(false);
  });

  it.each([
    ['page 0', { sort: 'recent', page: 0 }],
    ['page 음수', { sort: 'recent', page: -1 }],
    ['page 소수', { sort: 'recent', page: 1.5 }],
    ['시드 65자', { sort: 'random', page: 2, randomSeed: 'a'.repeat(65) }],
    ['시드에 !', { sort: 'random', page: 2, randomSeed: 'abc!' }],
    ['빈 시드(2페이지)', { sort: 'random', page: 2, randomSeed: '' }],
    ['시드 없는 랜덤 2페이지(F4)', { sort: 'random', page: 2 }],
    ['시드 null인 랜덤 2페이지(F4)', { sort: 'random', page: 3, randomSeed: null }],
  ] as const)('TC-DISP-003 TC-DISP-016 만들 수 없는 요청(%s)은 요청 없이 거절한다', async (_label, q) => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, page_(1)));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', ...q })).rejects.toBeDefined();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-DISP-015 랜덤 첫 페이지 응답의 randomSeed를 돌려준다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__random-page1-seed'));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'random', page: 1 })).resolves.toMatchObject({ randomSeed: 'seed_abc123', hasNext: true });
  });

  it('TC-DISP-019 randomSeed가 null인 비정상 랜덤 응답은 null로 해석한다(연속 로딩 중단은 ViewModel)', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__random-no-seed'));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'random', page: 1 })).resolves.toMatchObject({ randomSeed: null, hasNext: true });
  });

  it('TC-DISP-023 F9 범위 밖 page=99의 빈 posts·hasNext=false는 오류가 아니다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__page99-empty'));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 99 })).resolves.toMatchObject({ currentPage: 99, posts: [], hasNext: false });
  });

  it('TC-DISP-007 404 BUSINESS_ERROR("해당 날짜의 주제를 찾을 수 없습니다.")는 null이다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__404-topic-not-found'));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 })).resolves.toBeNull();
  });

  it.each(['display/posts-list__400-future-date', 'display/posts-list__400-bad-query'])('TC-DISP-008 %s는 message와 무관하게 ApiError(400)이고 재시도하지 않는다', async (fixture) => {
    const h = setup();
    h.ff.route('GET /posts', h.respond(fixture));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 })).rejects.toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-DISP-005 500은 재시도 뒤 ApiError이고 연결 실패는 NetworkError다', async () => {
    const server = setup();
    server.ff.route('GET /posts', server.respond('display/posts-list__500-server-error'));
    const failed = await server.settled(server.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 }));
    expect(failed.error).toBeInstanceOf(ApiError);
    expect(server.ff.calls).toHaveLength(3);
    const offline = setup();
    offline.ff.route('GET /posts', networkFailure);
    const lost = await offline.settled(offline.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 }));
    expect(lost.error).toBeInstanceOf(NetworkError);
  });

  it('TC-DISP-004 F10 게스트는 Authorization 없이 부르고 응답의 isLiked=false·isMine=false를 그대로 둔다', async () => {
    const guest = setup(guestSession);
    guest.ff.route('GET /posts', guest.respond('display/posts-list__guest-page1'));
    const result = await guest.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 });
    expect(guest.ff.calls[0]!.headers['authorization']).toBeUndefined();
    expect(result!.posts.every((p) => !p.isLiked && !p.isMine)).toBe(true);
    expect(result!.posts.find((p) => p.id.endsWith('201'))).toMatchObject({ authorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', isMine: false });
    const member = setup();
    member.ff.route('GET /posts', member.respond('display/posts-list__recent-page1'));
    await member.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 });
    expect(member.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-DISP-051 D-17 토큰 만료로 401이면 공개 API라도 refresh 1회 뒤 재전송한다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__401-unauthorized'), h.respond('display/posts-list__recent-page1'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 })).resolves.toMatchObject({ hasNext: true });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo('GET /posts')).toHaveLength(2);
    expect(h.ff.callsTo('GET /posts')[1]!.headers['authorization']).toBe('Bearer fixture-access-token-2');
  });

  it('TC-DISP-052 D-21 503 + Retry-After: 1이면 1초 뒤 재시도하고 멱등 GET은 최대 2회 재시도다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('display/posts-list__503-retry-after'), h.respond('display/posts-list__recent-page1'));
    const result = track(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 }));
    await h.clock.advance(999);
    expect(h.ff.calls).toHaveLength(1);
    await h.clock.advance(1);
    expect(h.ff.calls).toHaveLength(2);
    expect(result.state).toBe('fulfilled');
  });

  it('TC-DISP-002 REQ-DISP-034 thumbnailImageUrl·사인 URL은 null이어도 받는다', async () => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, page([rawPost({ thumbnailImageUrl: null, signatureOriginalImageUrl: null, signatureThumbnailImageUrl: null, title: null })])));
    const result = await h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 });
    expect(result!.posts[0]).toMatchObject({ thumbnailImageUrl: null, signatureOriginalImageUrl: null, signatureThumbnailImageUrl: null, title: null });
  });

  it.each([
    ['id 누락', rawPost({ id: undefined })],
    ['authorId 누락', rawPost({ authorId: undefined })],
    ['originalImageUrl 누락', rawPost({ originalImageUrl: undefined })],
    ['likeCount 음수', rawPost({ likeCount: -1 })],
    ['likeCount 문자열', rawPost({ likeCount: '3' })],
    ['isLiked 누락', rawPost({ isLiked: undefined })],
    ['isMine 누락', rawPost({ isMine: undefined })],
  ])('REQ-DISP-034 항목 하나라도 %s이면 그 응답 전체가 InvalidResponseError다', async (_label, bad) => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, page([rawPost(), bad])));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 })).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('REQ-DISP-034 목록 본문이 깨져도(posts 누락) InvalidResponseError다', async () => {
    const h = setup();
    h.ff.route('GET /posts', () => json(200, { currentPage: 1 }));
    await expect(h.repo.fetchPosts({ topicDate: '2026-10-27', sort: 'recent', page: 1 })).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

function page_(n: number) {
  return page([rawPost()], { currentPage: n });
}
