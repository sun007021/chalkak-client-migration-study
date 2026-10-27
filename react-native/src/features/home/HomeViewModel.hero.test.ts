import { json, networkFailure, deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { createHomeHarness, flush, MY_POST_ID } from './__testing__/createHomeHarness';

const TODAY_POSTS = 'GET /posts?topicDate=2026-10-27&sort=popular&page=1&pageSize=20';
const CAL_OCT = 'GET /posts/calendar?year=2026&month=10';
const THUMB = `https://cdn.example.test/posts/${MY_POST_ID}/thumbnail.webp`;

describe('HomeViewModel 오늘 주제 머리글', () => {
  it('TC-HOME-053 REQ-HOME-004 GET /topics?date=KST오늘로 받아 ready가 된다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.todayDate.toString()).toBe('2026-10-27');
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '가을 하늘' } });
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('TC-HOME-018 REQ-HOME-005 오늘 주제 404는 error가 아니라 ready(topic=null)이고 오늘 인기는 빈 ready다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__404-not-found');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.topic).toEqual({ status: 'ready', topic: null });
    expect(state.popular).toEqual({ status: 'ready', posts: [] });
    expect(h.router.calls(TODAY_POSTS)).toHaveLength(0);
  });

  it('REQ-HOME-005 주제 조회 5xx는 error이고 오늘 인기도 error다(다른 섹션은 정상)', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.topic).toEqual({ status: 'error' });
    expect(state.popular).toEqual({ status: 'error' });
    expect(state.yesterday.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
  });

  it('REQ-HOME-005 주제 400(미래 날짜)은 재시도 없이 error', async () => {
    const h = await createHomeHarness();
    h.router.set(
      'GET /topics?date=2026-10-27',
      fixtureResponseWith(400, {
        errorCode: 'BUSINESS_ERROR',
        message: '미래의 주제는 조회할 수 없습니다.',
      }),
    );
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().topic).toEqual({ status: 'error' });
    expect(h.router.calls('GET /topics?date=2026-10-27')).toHaveLength(1);
  });

  it('REQ-HOME-005 retryTopic은 주제와 오늘 인기를 다시 불러온다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /topics?date=2026-10-27', 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().topic.status).toBe('error');
    h.router.set('GET /topics?date=2026-10-27', 'home/topics__open-2026-10-27');
    await h.viewModel.retryTopic();
    expect(h.viewModel.getSnapshot().topic.status).toBe('ready');
    expect(h.viewModel.getSnapshot().popular.status).toBe('ready');
  });
});

function fixtureResponseWith(status: number, body: unknown) {
  return json(status, body);
}

describe('HomeViewModel 히어로 상태 (D-06)', () => {
  it('TC-HOME-001 REQ-HOME-007 /posts/today 응답 전 히어로는 loading이고 다른 섹션은 기다리지 않는다', async () => {
    const h = await createHomeHarness();
    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    const shown = h.viewModel.onShown();
    await flush();

    const state = h.viewModel.getSnapshot();
    expect(state.hero).toEqual({ kind: 'loading' });
    expect(state.popular.status).toBe('ready');
    expect(state.yesterday.status).toBe('ready');
    expect(state.weekly.status).toBe('ready');
    expect(h.bannerFeed.getSnapshot().status).toBe('ready');

    gate.resolve();
    await shown;
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');
  });

  it('TC-HOME-002 REQ-HOME-008 /posts/today 404는 no-open-topic이다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__404-no-open-topic');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'no-open-topic' });
    h.viewModel.onHeroPress();
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-HOME-003 REQ-HOME-009 isPosted=false는 empty이고 누르면 업로드 진입 게이트가 열린다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'empty', banned: false });
    h.viewModel.onHeroPress();
    expect(h.navigator.calls).toEqual([{ type: 'upload-gate' }]);
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-HOME-004 REQ-HOME-010 VALIDATING은 processing이고 달력에 postId가 없어도 유지된다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__posted-validating');
    h.router.set(CAL_OCT, 'home/posts-calendar__2026-10-empty');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'processing' });
    expect(h.viewModel.getSnapshot().aiCardPostId).toBeNull();
  });

  it('TC-HOME-005 REQ-HOME-011 PENDING은 검수 대기 사진이고 썸네일은 달력의 같은 postId에서 가져오며 상세 API는 부르지 않는다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__posted-pending');
    h.router.set(CAL_OCT, 'home/posts-calendar__2026-10-week-pending');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({
      kind: 'photo',
      postId: MY_POST_ID,
      pending: true,
      thumbnailUrl: THUMB,
    });
    expect(h.transport.requests.some((r) => new URL(r.url).pathname.endsWith(MY_POST_ID))).toBe(
      false,
    );
    expect(h.viewModel.getSnapshot().aiCardPostId).toBeNull();
  });

  it('TC-HOME-006 REQ-HOME-012 APPROVED는 배지 없는 사진이다. 눌러도 이동은 없다(home.md 확인 필요 항목, 임시 동작)', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({
      kind: 'photo',
      postId: MY_POST_ID,
      pending: false,
      thumbnailUrl: THUMB,
    });
    h.viewModel.onHeroPress();
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-HOME-007 REQ-HOME-013 주간 기록이 실패하면 히어로는 error가 되지 않고 썸네일만 null이다', async () => {
    const h = await createHomeHarness();
    h.router.set(CAL_OCT, 'home/posts-calendar__500-server-error');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.hero).toEqual({
      kind: 'photo',
      postId: MY_POST_ID,
      pending: false,
      thumbnailUrl: null,
    });
    expect(state.weekly).toEqual({ status: 'error' });
  });

  it('TC-HOME-007 달력이 같은 postId를 포함하지 않아도 썸네일은 null이다', async () => {
    const h = await createHomeHarness();
    h.router.set(CAL_OCT, 'home/posts-calendar__2026-10-empty');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toMatchObject({ kind: 'photo', thumbnailUrl: null });
  });

  it('TC-HOME-008 REQ-HOME-014 403(정지)은 empty(banned)이고 누르면 정지 안내, 같은 요청을 다시 보내지 않는다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__403-banned');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'empty', banned: true });

    h.viewModel.onHeroPress();
    expect(h.toast.messages).toEqual(['이용이 정지되어 게시물을 작성할 수 없어요.']);
    expect(h.navigator.calls).toEqual([]);
    expect(h.router.calls('GET /posts/today')).toHaveLength(1);
  });

  it('TC-HOME-009 REQ-HOME-015 500은 error이고 다시 시도하면 /posts/today를 1회 다시 보내 성공 상태로 바뀐다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'error' });
    h.router.set('GET /posts/today', 'home/posts-today__posted-approved'); // 호출 기록을 새로 시작

    await h.viewModel.retryHero();
    expect(h.router.calls('GET /posts/today')).toHaveLength(1);
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');
  });

  it('TC-HOME-009 연결 실패도 error이고 retry 중에는 loading으로 돌아간다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', networkFailure());
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'error' });

    const gate = deferred<void>();
    h.router.set('GET /posts/today', async () => {
      await gate.promise;
      return fixtureResponse('home/posts-today__posted-approved');
    });
    const retrying = h.viewModel.retryHero();
    await flush();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'loading' });
    gate.resolve();
    await retrying;
  });

  it('TC-HOME-010 REQ-HOME-016 반려 뒤 isPosted=false는 empty이고 error가 아니다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted-after-reject');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'empty', banned: false });
  });

  it('TC-HOME-011 REQ-HOME-017 알 수 없는 moderationStatus는 앱이 깨지지 않고 error 히어로다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__unknown-status');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'error' });
  });

  it('REQ-HOME-017 isPosted=false인데 postId가 있는 응답은 error 히어로다', async () => {
    const h = await createHomeHarness();
    h.router.set(
      'GET /posts/today',
      json(200, { topicDate: '2026-10-27', isPosted: false, postId: MY_POST_ID }),
    );
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero).toEqual({ kind: 'error' });
  });

  it('TC-HOME-014 REQ-HOME-048 401 UNAUTHORIZED는 refresh 1회 뒤 재전송되어 히어로가 정상 표시된다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', [
      'home/posts-today__401-unauthorized',
      'home/posts-today__posted-approved',
    ]);
    h.router.set('POST /auth/refresh', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyText: JSON.stringify({
        accessToken: 'access-2',
        expiresIn: 900,
        refreshToken: 'refresh-2',
        refreshTokenExpiresIn: 2592000,
      }),
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(h.router.calls('GET /posts/today')).toHaveLength(2);
  });

  it('TC-HOME-046 삭제 뒤 홈으로 돌아와 onShown 하면 히어로는 empty, 주간 칸이 사라진다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('photo');

    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    h.router.set(CAL_OCT, 'home/posts-calendar__2026-10-empty');
    await h.viewModel.onShown();
    const state = h.viewModel.getSnapshot();
    expect(state.hero).toEqual({ kind: 'empty', banned: false });
    expect(state.weekly).toMatchObject({ status: 'ready', count: 0 });
  });

  it('TC-HOME-047 REQ-HOME-043 업로드 직후 홈이 다시 보이면 Empty에서 processing으로 바뀐다', async () => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('empty');

    h.router.set('GET /posts/today', 'home/posts-today__posted-validating');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().hero.kind).toBe('processing');
  });
});

describe('HomeViewModel AI 피드백 카드 노출 (D-03, REQ-HOME-034)', () => {
  it('TC-HOME-054 APPROVED + 주제 날짜가 KST 오늘이면 카드 대상이고 폴러를 시작한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().aiCardPostId).toBe(MY_POST_ID);
    expect(h.aiReview.calls).toEqual([`start:${MY_POST_ID}`]);
    expect(h.transport.requestsTo('GET', '/ai-review')).toHaveLength(0); // 홈은 직접 조회하지 않는다
  });

  it.each([
    ['PENDING', 'home/posts-today__posted-pending'],
    ['VALIDATING', 'home/posts-today__posted-validating'],
    ['Empty', 'home/posts-today__not-posted'],
    ['NoOpenTopic', 'home/posts-today__404-no-open-topic'],
    ['403', 'home/posts-today__403-banned'],
    ['Error', 'home/posts-today__500-server-error'],
  ])('TC-HOME-054 히어로가 %s이면 카드도 폴러 시작도 없다', async (_name, fixture) => {
    const h = await createHomeHarness();
    h.router.set('GET /posts/today', fixture);
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().aiCardPostId).toBeNull();
    expect(h.aiReview.calls.filter((c) => c.startsWith('start'))).toEqual([]);
  });

  it('TC-HOME-054 지난 주제(topicDate가 KST 오늘이 아님)의 APPROVED는 카드가 없다', async () => {
    const h = await createHomeHarness();
    h.router.set(
      'GET /posts/today',
      json(200, {
        topicDate: '2026-10-26',
        isPosted: true,
        postId: MY_POST_ID,
        moderationStatus: 'APPROVED',
      }),
    );
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().aiCardPostId).toBeNull();
    expect(h.aiReview.calls).toEqual([]);
  });

  it('REQ-HOME-036 홈이 안 보이면 폴러를 멈추고, 다시 보이면 다시 시작한다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    expect(h.aiReview.calls).toEqual([`start:${MY_POST_ID}`, 'stop']);
    await h.viewModel.onShown();
    expect(h.aiReview.calls.at(-1)).toBe(`start:${MY_POST_ID}`);
  });

  it('REQ-HOME-037 히어로가 카드 대상에서 벗어나면 폴러를 멈춘다', async () => {
    const h = await createHomeHarness();
    await h.viewModel.onShown();
    h.router.set('GET /posts/today', 'home/posts-today__not-posted');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().aiCardPostId).toBeNull();
    expect(h.aiReview.calls.at(-1)).toBe('stop');
  });
});

describe('HomeViewModel 게스트 (D-05)', () => {
  it('TC-HOME-012 REQ-HOME-047 게스트는 개인 API를 부르지 않고 히어로 empty, 주간은 빈 7칸이며 랭킹·배너만 부른다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();

    const paths = h.transport.requests.map((r) => new URL(r.url).pathname.replace('/api/v1', ''));
    expect(paths).not.toContain('/posts/today');
    expect(paths).not.toContain('/posts/calendar');
    expect(paths).not.toContain('/notifications/unread-status');
    expect(paths).toContain('/banners');
    expect(paths.filter((p) => p === '/posts')).toHaveLength(2);

    const state = h.viewModel.getSnapshot();
    expect(state.hero).toEqual({ kind: 'empty', banned: false });
    expect(state.weekly).toMatchObject({ status: 'ready', count: 0 });
    expect(state.aiCardPostId).toBeNull();
    expect(state.popular.status).toBe('ready');
    expect(h.transport.requests.every((r) => r.headers.Authorization === undefined)).toBe(true);
  });

  it('TC-HOME-013 REQ-HOME-018 게스트가 히어로를 누르면 토스트만 뜨고 요청이 늘지 않는다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    const before = h.transport.requests.length;
    h.viewModel.onHeroPress();
    expect(h.toast.messages).toEqual(['게시물을 추가하려면 로그인이 필요해요']);
    expect(h.navigator.calls).toEqual([]);
    expect(h.transport.requests).toHaveLength(before);
  });

  it('TC-HOME-049 REQ-HOME-046 게스트의 알림 버튼은 토스트만, 미읽음 조회도 없다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    h.viewModel.onNotificationPress();
    await h.viewModel.onPushReceived();
    expect(h.toast.messages).toEqual(['로그인 후 알림을 확인할 수 있어요']);
    expect(h.navigator.calls).toEqual([]);
    expect(h.transport.requestsTo('GET', '/notifications/unread-status')).toHaveLength(0);
  });

  it('TC-HOME-022 REQ-HOME-032 게스트가 랭킹 사진을 누르면 토스트만 뜨고 이동·상세 요청이 없다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    const first = firstPostId(h.viewModel.getSnapshot().popular);
    h.viewModel.onRankingItemPress('popular', first);
    expect(h.toast.messages).toEqual(['게시물 피드를 보려면 로그인이 필요해요']);
    expect(h.navigator.calls).toEqual([]);
  });

  it('REQ-HOME-033 게스트가 하트를 누르면 컨트롤러에 위임하지 않고 토스트만 뜬다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    await h.viewModel.onShown();
    h.viewModel.onRankingLikePress('popular', firstPostId(h.viewModel.getSnapshot().popular));
    expect(h.toast.messages).toEqual(['좋아요를 누르려면 로그인이 필요해요']);
    expect(h.likes.toggled).toEqual([]);
  });

  it('TC-BANR-009 TC-BANR-027 게스트도 배너를 보고 누르면 로그인 요구 없이 웹뷰로 간다. 랭킹이 실패해도 배너는 독립적이다', async () => {
    const h = await createHomeHarness({ mode: 'guest' });
    h.router.set(TODAY_POSTS, 'home/posts-list__500-server-error');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().popular).toEqual({ status: 'error' });
    expect(h.bannerFeed.getSnapshot().status).toBe('ready');

    h.viewModel.onBannerPress('44444444-4444-4444-8444-444444444402');
    expect(h.navigator.calls).toEqual([
      {
        type: 'banner',
        id: '44444444-4444-4444-8444-444444444402',
        webViewUrl: 'https://web.example.test/issues/2',
      },
    ]);
    expect(h.toast.messages).toEqual([]);
  });
});

function firstPostId(section: { status: string; posts?: readonly { id: string }[] }): string {
  if (section.status !== 'ready' || !section.posts?.length) throw new Error('랭킹 항목 없음');
  return section.posts[0].id;
}
