import { ApiError, InvalidResponseError, NetworkError } from '../../core/net/errors';
import { makeApiEnv } from '../../test/apiEnv';
import { networkFailure } from '../../test/fakeFetch';
import { gatewayHtml, loadFixture, memberSession } from '../../test/fixtures';
import { json } from '../../test/fixtureRouter';
import { guestSession } from '../../test/fixtures';
import { track } from '../../test/track';
import type { StoredSession } from '../../core/auth/SessionStore';
import { HomeRepository } from './HomeRepository';

function setup(session: StoredSession = memberSession()) {
  const env = makeApiEnv(session);
  const repo = new HomeRepository({ api: env.client() });
  const respond = (fixture: string) => () => loadFixture(`${fixture}.json`).toResponse();
  /** 재시도 백오프(0.5초·1초)를 가짜 시계로 소화하고 결과를 돌려준다. */
  const settled = async <T>(promise: Promise<T>) => {
    const result = track(promise);
    await env.clock.advance(5_000);
    return result;
  };
  return { ...env, repo, respond, settled };
}

describe('HomeRepository.fetchTopic (GET /topics)', () => {
  it('TC-HOME-015 TC-HOME-053 ?date=yyyy-MM-dd로 요청하고 응답을 값으로 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('home/topics__open-2026-10-27'));
    const topic = await h.repo.fetchTopic('2026-10-27');
    expect(h.ff.calls).toHaveLength(1);
    expect(h.ff.calls[0]!.query.get('date')).toBe('2026-10-27');
    expect(topic).toMatchObject({ id: '11111111-1111-4111-8111-111111111127', title: '가을 하늘', topicDate: '2026-10-27', phase: 'OPEN' });
  });

  it('TC-HOME-012 REQ-HOME-047 게스트는 Authorization 없이, 회원은 토큰과 함께 부른다(공개 API의 선택 인증)', async () => {
    const guest = setup(guestSession);
    guest.ff.route('GET /topics', guest.respond('home/topics__open-2026-10-27'));
    await guest.repo.fetchTopic('2026-10-27');
    expect(guest.ff.calls[0]!.headers['authorization']).toBeUndefined();

    const member = setup();
    member.ff.route('GET /topics', member.respond('home/topics__open-2026-10-27'));
    await member.repo.fetchTopic('2026-10-27');
    expect(member.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('TC-HOME-017 TC-HOME-018 404 BUSINESS_ERROR "주제를 찾을 수 없습니다."는 오류가 아니라 null이다', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('home/topics__404-not-found'));
    await expect(h.repo.fetchTopic('2026-10-26')).resolves.toBeNull();
    expect(h.ff.calls).toHaveLength(1); // 404는 재시도하지 않는다
  });

  it('본문 없는 404(게이트웨이 HTML)는 "주제 없음"이 아니라 오류로 던진다', async () => {
    const h = setup();
    h.ff.route('GET /topics', () => new Response(gatewayHtml, { status: 404, headers: { 'content-type': 'text/html' } }));
    const result = await h.settled(h.repo.fetchTopic('2026-10-26'));
    expect(result.state).toBe('rejected');
  });

  it('REQ-HOME-005 400(미래 날짜)은 null이 아니라 ApiError(400)이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route('GET /topics', () => json(400, { errorCode: 'BUSINESS_ERROR', message: '미래의 주제는 조회할 수 없습니다.' }));
    const result = await h.settled(h.repo.fetchTopic('2026-10-28'));
    expect(result.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('D-21 5xx는 GET 재시도(0.5초, 1초) 뒤에도 실패하면 ApiError를 던진다(총 3회)', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('home/posts-list__500-server-error'));
    const result = await h.settled(h.repo.fetchTopic('2026-10-27'));
    expect(result.error).toBeInstanceOf(ApiError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('D-21 연결 실패는 재시도 뒤 NetworkError', async () => {
    const h = setup();
    h.ff.route('GET /topics', networkFailure);
    const result = await h.settled(h.repo.fetchTopic('2026-10-27'));
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-HOME-015 응답 topicDate가 요청 날짜와 다르면 InvalidResponseError(응답 검증 실패)', async () => {
    const h = setup();
    h.ff.route('GET /topics', h.respond('home/topics__open-2026-10-28'));
    const result = await h.settled(h.repo.fetchTopic('2026-10-27'));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-010 필수 필드(title)나 알 수 없는 phase가 있으면 InvalidResponseError', async () => {
    const base = loadFixture('home/topics__open-2026-10-27.json').json as Record<string, unknown>;
    for (const body of [{ ...base, title: undefined }, { ...base, phase: 'SOMETHING_NEW' }]) {
      const h = setup();
      h.ff.route('GET /topics', () => json(200, body));
      const result = await h.settled(h.repo.fetchTopic('2026-10-27'));
      expect(result.error).toBeInstanceOf(InvalidResponseError);
    }
  });

  it('TC-BANR-008 취소(signal)는 AbortError 그대로이고 다른 오류로 바뀌지 않는다', async () => {
    const h = setup();
    const controller = new AbortController();
    h.ff.route('GET /topics', () => new Promise<Response>(() => {}));
    const pending = track(h.repo.fetchTopic('2026-10-27', controller.signal));
    await h.clock.advance(0);
    controller.abort();
    await h.clock.advance(0);
    expect(pending.state).toBe('rejected');
    expect(pending.error).toMatchObject({ name: 'AbortError' });
  });
});

describe('HomeRepository.fetchPopularPosts (GET /posts)', () => {
  it('TC-HOME-015 topicDate, sort=popular(소문자), page=1, pageSize=20으로 요청한다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('home/posts-list__popular-8'));
    await h.repo.fetchPopularPosts('2026-10-27');
    const query = Object.fromEntries(h.ff.calls[0]!.query.entries());
    expect(query).toEqual({ topicDate: '2026-10-27', sort: 'popular', page: '1', pageSize: '20' });
  });

  it('TC-HOME-015 서버 순서를 그대로 두고 필드를 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('home/posts-list__popular-8'));
    const posts = await h.repo.fetchPopularPosts('2026-10-27');
    expect(posts.map((p) => p.id.slice(-3))).toEqual(['202', '203', '204', '205', '206', '207', '208', '201']);
    expect(posts[0]).toMatchObject({
      id: '22222222-2222-4222-8222-222222222202',
      thumbnailImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/thumbnail.webp',
      originalImageUrl: 'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/original.webp',
      title: '은행잎',
      likeCount: 38,
      isLiked: false,
      isMine: false,
    });
  });

  it('TC-HOME-019 posts가 빈 배열이어도 오류 없이 빈 목록이다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('home/posts-list__popular-0'));
    await expect(h.repo.fetchPopularPosts('2026-10-27')).resolves.toEqual([]);
  });

  it('TC-NET-010 nullable 필드(title, thumbnailImageUrl)는 null과 생략 모두 받는다', async () => {
    const h = setup();
    const page = loadFixture('home/posts-list__popular-1.json').json as { posts: Record<string, unknown>[] };
    page.posts[0] = { ...page.posts[0], title: null, thumbnailImageUrl: null };
    h.ff.route('GET /posts', () => json(200, page));
    const [post] = await h.repo.fetchPopularPosts('2026-10-27');
    expect(post).toMatchObject({ title: null, thumbnailImageUrl: null });
  });

  it('TC-NET-010 필수 필드(likeCount)가 없으면 InvalidResponseError', async () => {
    const h = setup();
    const page = loadFixture('home/posts-list__popular-1.json').json as { posts: Record<string, unknown>[] };
    page.posts[0] = { ...page.posts[0], likeCount: undefined };
    h.ff.route('GET /posts', () => json(200, page));
    const result = await h.settled(h.repo.fetchPopularPosts('2026-10-27'));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-017 REQ-HOME-029 404 BUSINESS_ERROR("해당 날짜의 주제를 찾을 수 없습니다.")는 빈 목록이다', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('home/topics__404-not-found'));
    await expect(h.repo.fetchPopularPosts('2026-10-27')).resolves.toEqual([]);
  });

  it('TC-HOME-020 5xx는 재시도 뒤 ApiError', async () => {
    const h = setup();
    h.ff.route('GET /posts', h.respond('home/posts-list__500-server-error'));
    const result = await h.settled(h.repo.fetchPopularPosts('2026-10-27'));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });

  it('TC-HOME-012 게스트는 Authorization 없이 부른다', async () => {
    const h = setup(guestSession);
    h.ff.route('GET /posts', h.respond('home/posts-list__popular-5'));
    await h.repo.fetchPopularPosts('2026-10-27');
    expect(h.ff.calls[0]!.headers['authorization']).toBeUndefined();
  });
});

describe('HomeRepository.fetchTodayPost (GET /posts/today)', () => {
  it('TC-HOME-006 토큰과 함께 부르고 APPROVED를 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond('home/posts-today__posted-approved'));
    await expect(h.repo.fetchTodayPost()).resolves.toEqual({
      kind: 'posted',
      topicDate: '2026-10-27',
      postId: '22222222-2222-4222-8222-222222222201',
      moderationStatus: 'APPROVED',
    });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it.each([
    ['home/posts-today__posted-validating', 'VALIDATING'],
    ['home/posts-today__posted-pending', 'PENDING'],
  ])('TC-HOME-004 TC-HOME-005 %s는 %s로 해석한다', async (fixture, status) => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond(fixture));
    await expect(h.repo.fetchTodayPost()).resolves.toMatchObject({ kind: 'posted', moderationStatus: status });
  });

  it.each(['home/posts-today__not-posted', 'home/posts-today__not-posted-after-reject'])('TC-HOME-003 TC-HOME-010 %s: isPosted=false(postId·moderationStatus null)는 not-posted다', async (fixture) => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond(fixture));
    await expect(h.repo.fetchTodayPost()).resolves.toEqual({ kind: 'not-posted', topicDate: '2026-10-27' });
  });

  it('TC-NET-010 isPosted=false에서 postId·moderationStatus 키가 생략돼도 받는다', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', () => json(200, { topicDate: '2026-10-27', isPosted: false }));
    await expect(h.repo.fetchTodayPost()).resolves.toEqual({ kind: 'not-posted', topicDate: '2026-10-27' });
  });

  it('TC-HOME-011 알 수 없는 moderationStatus(SOMETHING_NEW)와 REJECTED는 InvalidResponseError(서버는 반려를 isPosted=false로 준다)', async () => {
    for (const body of [loadFixture('home/posts-today__unknown-status.json').json, { topicDate: '2026-10-27', isPosted: true, postId: 'p', moderationStatus: 'REJECTED' }]) {
      const h = setup();
      h.ff.route('GET /posts/today', () => json(200, body));
      const result = await h.settled(h.repo.fetchTodayPost());
      expect(result.error).toBeInstanceOf(InvalidResponseError);
    }
  });

  it.each([
    ['isPosted=false인데 postId가 있다', { topicDate: '2026-10-27', isPosted: false, postId: '22222222-2222-4222-8222-222222222201', moderationStatus: null }],
    ['isPosted=false인데 moderationStatus가 있다', { topicDate: '2026-10-27', isPosted: false, postId: null, moderationStatus: 'PENDING' }],
    ['isPosted=true인데 postId가 없다', { topicDate: '2026-10-27', isPosted: true, postId: null, moderationStatus: 'PENDING' }],
    ['isPosted=true인데 moderationStatus가 없다', { topicDate: '2026-10-27', isPosted: true, postId: '22222222-2222-4222-8222-222222222201', moderationStatus: null }],
  ])('REQ-HOME-017 %s → InvalidResponseError', async (_name, body) => {
    const h = setup();
    h.ff.route('GET /posts/today', () => json(200, body));
    const result = await h.settled(h.repo.fetchTodayPost());
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-002 404는 no-open-topic이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond('home/posts-today__404-no-open-topic'));
    await expect(h.repo.fetchTodayPost()).resolves.toEqual({ kind: 'no-open-topic' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-HOME-008 403 FORBIDDEN은 banned이고 재시도하지 않는다', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond('home/posts-today__403-banned'));
    await expect(h.repo.fetchTodayPost()).resolves.toEqual({ kind: 'banned' });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('TC-HOME-009 500은 재시도 뒤 ApiError를 던진다(히어로 Error)', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond('home/posts-today__500-server-error'));
    const result = await h.settled(h.repo.fetchTodayPost());
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-HOME-014 D-17 401 UNAUTHORIZED면 refresh 1회 뒤 원 요청을 1회 재전송해 성공한다', async () => {
    const h = setup();
    h.ff.route('GET /posts/today', h.respond('home/posts-today__401-unauthorized'), h.respond('home/posts-today__posted-approved'));
    h.ff.route('POST /auth/refresh', h.respond('auth/refresh__success'));
    await expect(h.repo.fetchTodayPost()).resolves.toMatchObject({ kind: 'posted', moderationStatus: 'APPROVED' });
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(h.ff.callsTo('GET /posts/today')).toHaveLength(2);
  });
});

describe('HomeRepository.fetchCalendar (GET /posts/calendar)', () => {
  it('TC-HOME-026 ?year&month로 토큰과 함께 부르고 항목을 해석한다', async () => {
    const h = setup();
    h.ff.route('GET /posts/calendar', h.respond('home/posts-calendar__2026-10-week-approved'));
    const entries = await h.repo.fetchCalendar(2026, 10);
    const call = h.ff.calls[0]!;
    expect(Object.fromEntries(call.query.entries())).toEqual({ year: '2026', month: '10' });
    expect(call.headers['authorization']).toBe('Bearer fixture-access-token-1');
    expect(entries.map((e) => [e.topicDate, e.postId.slice(-2), e.status])).toEqual([
      ['2026-10-25', '93', 'APPROVED'],
      ['2026-10-26', '94', 'APPROVED'],
      ['2026-10-27', '01', 'APPROVED'],
    ]);
    expect(entries[2]!.thumbnailImageUrl).toBe('https://cdn.example.test/posts/22222222-2222-4222-8222-222222222201/thumbnail.webp');
  });

  it('TC-HOME-030 PENDING을 해석하고 빈 달은 빈 배열이다', async () => {
    const h = setup();
    h.ff.route('GET /posts/calendar', h.respond('home/posts-calendar__2026-10-week-pending'));
    const entries = await h.repo.fetchCalendar(2026, 10);
    expect(entries.some((e) => e.status === 'PENDING')).toBe(true);
    const empty = setup();
    empty.ff.route('GET /posts/calendar', empty.respond('home/posts-calendar__2026-10-empty'));
    await expect(empty.repo.fetchCalendar(2026, 10)).resolves.toEqual([]);
  });

  it('TC-NET-010 thumbnailImageUrl은 null이어도 받는다', async () => {
    const h = setup();
    h.ff.route('GET /posts/calendar', () => json(200, { year: 2026, month: 10, posts: [{ topicDate: '2026-10-27', postId: 'p1', thumbnailImageUrl: null, status: 'PENDING' }] }));
    const [entry] = await h.repo.fetchCalendar(2026, 10);
    expect(entry).toMatchObject({ thumbnailImageUrl: null, status: 'PENDING' });
  });

  it('TC-NET-009 알 수 없는 status(REJECTED 포함)나 yyyy-MM-dd가 아닌 topicDate는 InvalidResponseError', async () => {
    for (const post of [
      { topicDate: '2026-10-27', postId: 'p1', thumbnailImageUrl: null, status: 'REJECTED' },
      { topicDate: '2026/10/27', postId: 'p1', thumbnailImageUrl: null, status: 'APPROVED' },
    ]) {
      const h = setup();
      h.ff.route('GET /posts/calendar', () => json(200, { year: 2026, month: 10, posts: [post] }));
      const result = await h.settled(h.repo.fetchCalendar(2026, 10));
      expect(result.error).toBeInstanceOf(InvalidResponseError);
    }
  });

  it('TC-HOME-032 5xx는 재시도 뒤 ApiError', async () => {
    const h = setup();
    h.ff.route('GET /posts/calendar', h.respond('home/posts-calendar__500-server-error'));
    const result = await h.settled(h.repo.fetchCalendar(2026, 10));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(3);
  });
});

describe('HomeRepository.fetchUnreadStatus (GET /notifications/unread-status)', () => {
  it('TC-HOME-050 토큰과 함께 부르고 hasUnread를 돌려준다', async () => {
    const h = setup();
    h.ff.route('GET /notifications/unread-status', h.respond('home/notifications-unread-status__true'));
    await expect(h.repo.fetchUnreadStatus()).resolves.toBe(true);
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
    const off = setup();
    off.ff.route('GET /notifications/unread-status', off.respond('home/notifications-unread-status__false'));
    await expect(off.repo.fetchUnreadStatus()).resolves.toBe(false);
  });

  it('TC-HOME-052 5xx는 재시도 뒤 ApiError를 던진다(무시 여부는 ViewModel이 정한다)', async () => {
    const h = setup();
    h.ff.route('GET /notifications/unread-status', h.respond('home/notifications-unread-status__500-server-error'));
    const result = await h.settled(h.repo.fetchUnreadStatus());
    expect(result.error).toMatchObject({ status: 500 });
  });

  it('TC-NET-010 hasUnread가 없거나 boolean이 아니면 InvalidResponseError', async () => {
    for (const body of [{}, { hasUnread: 'true' }]) {
      const h = setup();
      h.ff.route('GET /notifications/unread-status', () => json(200, body));
      const result = await h.settled(h.repo.fetchUnreadStatus());
      expect(result.error).toBeInstanceOf(InvalidResponseError);
    }
  });
});

describe('HomeRepository AI 피드백 (홈 카드: GET 상태, POST 요청)', () => {
  const POST = '22222222-2222-4222-8222-222222222201';

  it.each([
    ['ai-review/ai-review-get__none', 'NONE', false],
    ['ai-review/ai-review-get__processing', 'PROCESSING', false],
    ['ai-review/ai-review-get__completed', 'COMPLETED', false],
    ['ai-review/ai-review-get__failed-can-retry', 'FAILED', true],
    ['ai-review/ai-review-get__failed-cannot-retry', 'FAILED', false],
  ])('TC-HOME-054 GET /posts/{postId}/ai-review %s → %s, canRequestAgain=%s', async (fixture, status, canRequestAgain) => {
    const h = setup();
    h.ff.route(`GET /posts/${POST}/ai-review`, h.respond(fixture));
    await expect(h.repo.fetchAiReview(POST)).resolves.toEqual({ status, canRequestAgain });
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('canRequestAgain이 없는 구버전 응답은 false다', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${POST}/ai-review`, h.respond('ai-review/ai-review-get__missing-can-request-again'));
    await expect(h.repo.fetchAiReview(POST)).resolves.toMatchObject({ canRequestAgain: false });
  });

  it('REQ-HOME-035 404는 null(카드 숨김)이고 알 수 없는 status는 InvalidResponseError', async () => {
    const h = setup();
    h.ff.route(`GET /posts/${POST}/ai-review`, h.respond('ai-review/ai-review-get__404-not-found'));
    await expect(h.repo.fetchAiReview(POST)).resolves.toBeNull();
    const bad = setup();
    bad.ff.route(`GET /posts/${POST}/ai-review`, bad.respond('ai-review/ai-review-get__unknown-status'));
    const result = await bad.settled(bad.repo.fetchAiReview(POST));
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-054 POST /posts/{postId}/ai-review는 본문 없이 1회 보내고 202 PROCESSING을 돌려준다', async () => {
    const h = setup();
    h.ff.route(`POST /posts/${POST}/ai-review`, h.respond('ai-review/ai-review-post__202-processing'));
    await expect(h.repo.requestAiReview(POST)).resolves.toMatchObject({ status: 'PROCESSING' });
    expect(h.ff.calls[0]!.body).toBeNull();
    expect(h.ff.calls[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });

  it('D-21 POST는 5xx·연결 실패에도 자동 재전송하지 않는다', async () => {
    const h = setup();
    h.ff.route(`POST /posts/${POST}/ai-review`, h.respond('ai-review/ai-review-post__500-server-error'));
    const result = await h.settled(h.repo.requestAiReview(POST));
    expect(result.error).toMatchObject({ status: 500 });
    expect(h.ff.calls).toHaveLength(1);
  });

  it('D-08 403은 ApiError(403)이고 재전송하지 않는다', async () => {
    const h = setup();
    h.ff.route(`POST /posts/${POST}/ai-review`, h.respond('ai-review/ai-review-post__403-banned'));
    const result = await h.settled(h.repo.requestAiReview(POST));
    expect(result.error).toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
    expect(h.ff.calls).toHaveLength(1);
  });
});
