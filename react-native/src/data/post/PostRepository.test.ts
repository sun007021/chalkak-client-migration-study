import { HttpError, InvalidResponseError } from '../../core/http/ApiError';
import {
  createNetHarness,
  refreshOk,
  unauthorized,
} from '../../core/http/__testing__/createNetHarness';
import { json } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { KstDate } from '../../core/time/KstDate';
import { FixtureRouter } from '../__testing__/FixtureRouter';
import { authorizationOf, pathOf, queryOf } from '../__testing__/requestAsserts';
import { PostRepository } from './PostRepository';

const TODAY = KstDate.of(2026, 10, 27);
const POST_ID = '22222222-2222-4222-8222-222222222201';

function setup() {
  const net = createNetHarness();
  return { ...net, repository: new PostRepository({ api: net.api }) };
}

describe('PostRepository.list', () => {
  it('TC-HOME-015 GET /posts?topicDate&sort=popular&page=1&pageSize=20(소문자 sort)로 요청한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__popular-8'));

    await h.repository.list({ topicDate: TODAY, sort: 'popular' });

    const [request] = h.transport.requests;
    expect(pathOf(request)).toBe('/posts');
    expect(queryOf(request)).toEqual({
      topicDate: '2026-10-27',
      sort: 'popular',
      page: '1',
      pageSize: '20',
    });
  });

  it('TC-HOME-015 서버 순서를 그대로 두고 필드를 해석한다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__popular-8'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'popular' });

    const expected = fixtureBody<{ posts: { id: string }[] }>('home/posts-list__popular-8').posts;
    expect(page.posts.map((p) => p.id)).toEqual(expected.map((p) => p.id));
    expect(page).toMatchObject({ currentPage: 1, pageSize: 20, hasNext: false });
    expect(page.posts[0]).toEqual({
      id: '22222222-2222-4222-8222-222222222202',
      authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      originalImageUrl:
        'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/original.webp',
      thumbnailImageUrl:
        'https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/thumbnail.webp',
      signatureOriginalImageUrl:
        'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.png',
      signatureThumbnailImageUrl:
        'https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/thumbnail.png',
      title: '은행잎',
      submittedAt: new Date('2026-10-27T02:59:00Z'),
      likeCount: 38,
      isLiked: false,
      isMine: false,
    });
  });

  it('TC-HOME-019 posts가 빈 배열이어도 오류 없이 빈 페이지다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__popular-0'));
    const page = await h.repository.list({ topicDate: TODAY, sort: 'popular' });
    expect(page.posts).toEqual([]);
  });

  it('TC-NET-010 nullable 필드(title, thumbnailImageUrl)는 null과 생략 모두 받는다', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>('home/posts-list__popular-3');
    body.posts[0].title = null;
    body.posts[0].thumbnailImageUrl = null;
    delete body.posts[1].title;
    delete body.posts[1].thumbnailImageUrl;
    h.transport.script(json(200, body));

    const page = await h.repository.list({ topicDate: TODAY, sort: 'popular' });

    expect(page.posts[0]).toMatchObject({ title: null, thumbnailImageUrl: null });
    expect(page.posts[1]).toMatchObject({ title: null, thumbnailImageUrl: null });
  });

  it('TC-NET-010 필수 필드(likeCount)가 없으면 InvalidResponseError', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>('home/posts-list__popular-3');
    delete body.posts[2].likeCount;
    h.transport.script(json(200, body));
    await expect(h.repository.list({ topicDate: TODAY, sort: 'popular' })).rejects.toBeInstanceOf(
      InvalidResponseError,
    );
  });

  it('TC-HOME-017 404 BUSINESS_ERROR는 HttpError 404로 전달된다(빈 상태 판단은 ViewModel)', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/topics__404-not-found'));
    await expect(h.repository.list({ topicDate: TODAY, sort: 'popular' })).rejects.toMatchObject({
      name: 'HttpError',
      status: 404,
    });
  });

  it('TC-HOME-020 5xx는 재시도 뒤 HttpError', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__500-server-error'));
    await expect(h.repository.list({ topicDate: TODAY, sort: 'popular' })).rejects.toBeInstanceOf(
      HttpError,
    );
    expect(h.transport.requests).toHaveLength(3);
  });

  it('TC-HOME-012 게스트는 Authorization 없이 부른다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-list__popular-5'));
    await h.repository.list({ topicDate: TODAY, sort: 'popular' });
    expect(authorizationOf(h.transport.requests[0])).toBeUndefined();
  });
});

describe('PostRepository.getToday', () => {
  it('TC-HOME-006 GET /posts/today를 토큰과 함께 부르고 APPROVED를 해석한다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/posts-today__posted-approved'));

    const today = await h.repository.getToday();

    const [request] = h.transport.requests;
    expect(pathOf(request)).toBe('/posts/today');
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(today).toEqual({
      topicDate: TODAY,
      isPosted: true,
      postId: POST_ID,
      moderationStatus: 'APPROVED',
    });
  });

  it.each([
    ['home/posts-today__posted-validating', 'VALIDATING'],
    ['home/posts-today__posted-pending', 'PENDING'],
  ])('TC-HOME-004 TC-HOME-005 %s는 %s로 해석한다', async (fixture, status) => {
    const h = setup();
    h.transport.script(fixtureResponse(fixture));
    await expect(h.repository.getToday()).resolves.toMatchObject({
      isPosted: true,
      moderationStatus: status,
    });
  });

  it.each(['home/posts-today__not-posted', 'home/posts-today__not-posted-after-reject'])(
    'TC-HOME-003 TC-HOME-010 %s: isPosted=false이고 postId·moderationStatus가 null이어도 깨지지 않는다',
    async (fixture) => {
      const h = setup();
      h.transport.script(fixtureResponse(fixture));
      await expect(h.repository.getToday()).resolves.toEqual({ topicDate: TODAY, isPosted: false });
    },
  );

  it('TC-NET-010 isPosted=false에서 postId·moderationStatus 키가 생략돼도 받는다', async () => {
    const h = setup();
    h.transport.script(json(200, { topicDate: '2026-10-27', isPosted: false }));
    await expect(h.repository.getToday()).resolves.toEqual({ topicDate: TODAY, isPosted: false });
  });

  it('TC-HOME-011 알 수 없는 moderationStatus는 깨지지 않고 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-today__unknown-status'));
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-011 REJECTED 값도 클라이언트가 처리하지 않는 값이라 InvalidResponseError(서버는 isPosted=false로 준다)', async () => {
    const h = setup();
    h.transport.script(
      json(200, {
        topicDate: '2026-10-27',
        isPosted: true,
        postId: POST_ID,
        moderationStatus: 'REJECTED',
      }),
    );
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('REQ-HOME-017 isPosted=false인데 postId가 있으면 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(json(200, { topicDate: '2026-10-27', isPosted: false, postId: POST_ID }));
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('REQ-HOME-017 isPosted=false인데 moderationStatus가 있으면 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(
      json(200, { topicDate: '2026-10-27', isPosted: false, moderationStatus: 'PENDING' }),
    );
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('REQ-HOME-017 isPosted=true인데 postId가 없으면 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(
      json(200, {
        topicDate: '2026-10-27',
        isPosted: true,
        postId: null,
        moderationStatus: 'PENDING',
      }),
    );
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('REQ-HOME-017 isPosted=true인데 moderationStatus가 없으면 InvalidResponseError', async () => {
    const h = setup();
    h.transport.script(json(200, { topicDate: '2026-10-27', isPosted: true, postId: POST_ID }));
    await expect(h.repository.getToday()).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-002 404는 HttpError 404로 전달된다(NoOpenTopic 판단은 ViewModel)', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/posts-today__404-no-open-topic'));
    await expect(h.repository.getToday()).rejects.toMatchObject({ name: 'HttpError', status: 404 });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-HOME-008 403 FORBIDDEN은 HttpError 403이고 재시도하지 않는다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/posts-today__403-banned'));
    await expect(h.repository.getToday()).rejects.toMatchObject({
      name: 'HttpError',
      status: 403,
      errorCode: 'FORBIDDEN',
    });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-HOME-014 401 UNAUTHORIZED면 refresh 1회 뒤 원 요청을 1회 재전송해 성공한다', async () => {
    const h = setup();
    await h.signIn();
    const router = new FixtureRouter({
      'GET /posts/today': [unauthorized(), fixtureResponse('home/posts-today__posted-approved')],
      'POST /auth/refresh': refreshOk(),
    }).install(h.transport);

    await expect(h.repository.getToday()).resolves.toMatchObject({ moderationStatus: 'APPROVED' });

    expect(router.calls('POST /auth/refresh')).toHaveLength(1);
    const todays = router.calls('GET /posts/today');
    expect(todays).toHaveLength(2);
    expect(authorizationOf(todays[0])).toBe('Bearer access-1');
    expect(authorizationOf(todays[1])).toBe('Bearer access-2');
  });
});

describe('PostRepository.getCalendar', () => {
  it('TC-HOME-026 GET /posts/calendar?year&month를 토큰과 함께 부르고 항목을 해석한다', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/posts-calendar__2026-10-week-approved'));

    const month = await h.repository.getCalendar(2026, 10);

    const [request] = h.transport.requests;
    expect(pathOf(request)).toBe('/posts/calendar');
    expect(queryOf(request)).toEqual({ year: '2026', month: '10' });
    expect(authorizationOf(request)).toBe('Bearer access-1');
    expect(month.year).toBe(2026);
    expect(month.month).toBe(10);
    expect(month.posts.map((p) => p.topicDate.toString())).toEqual([
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
    expect(month.posts[2]).toEqual({
      topicDate: TODAY,
      postId: POST_ID,
      thumbnailImageUrl: `https://cdn.example.test/posts/${POST_ID}/thumbnail.webp`,
      status: 'APPROVED',
    });
  });

  it('TC-HOME-030 PENDING 상태를 해석하고 빈 달은 빈 배열이다', async () => {
    const h = setup();
    h.transport.script(fixtureResponse('home/posts-calendar__2026-10-week-pending'));
    const pending = await h.repository.getCalendar(2026, 10);
    expect(pending.posts[1].status).toBe('PENDING');

    h.transport.script(fixtureResponse('home/posts-calendar__2026-10-empty'));
    await expect(h.repository.getCalendar(2026, 10)).resolves.toMatchObject({ posts: [] });
  });

  it('TC-NET-010 thumbnailImageUrl은 null이어도 받는다', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>(
      'home/posts-calendar__2026-10-week-approved',
    );
    body.posts[0].thumbnailImageUrl = null;
    h.transport.script(json(200, body));
    const month = await h.repository.getCalendar(2026, 10);
    expect(month.posts[0].thumbnailImageUrl).toBeNull();
  });

  it('TC-NET-009 알 수 없는 status(REJECTED 포함)는 InvalidResponseError', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>(
      'home/posts-calendar__2026-10-week-approved',
    );
    body.posts[1].status = 'REJECTED';
    h.transport.script(json(200, body));
    await expect(h.repository.getCalendar(2026, 10)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-010 topicDate가 yyyy-MM-dd가 아니면 InvalidResponseError', async () => {
    const h = setup();
    const body = fixtureBody<{ posts: Record<string, unknown>[] }>(
      'home/posts-calendar__2026-10-week-approved',
    );
    body.posts[0].topicDate = '2026/10/25';
    h.transport.script(json(200, body));
    await expect(h.repository.getCalendar(2026, 10)).rejects.toBeInstanceOf(InvalidResponseError);
  });

  it('TC-HOME-032 5xx는 재시도 뒤 HttpError', async () => {
    const h = setup();
    await h.signIn();
    h.transport.script(fixtureResponse('home/posts-calendar__500-server-error'));
    await expect(h.repository.getCalendar(2026, 10)).rejects.toBeInstanceOf(HttpError);
    expect(h.transport.requests).toHaveLength(3);
  });
});
