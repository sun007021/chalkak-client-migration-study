import { t } from '../../copy/ko';
import { networkFailure } from '../../test/fakeFetch';
import { deferred } from '../../test/deferred';
import { json } from '../../test/fixtureRouter';
import { loadFixture } from '../../test/fixtures';
import { CALENDAR_OCT, MY_POST_ID, POPULAR_TODAY, TODAY_POST, TOPICS_TODAY, createHomeHarness, finish, settle } from '../../test/homeHarness';

const THUMB = `https://cdn.example.test/posts/${MY_POST_ID}/thumbnail.webp`;

describe('HomeViewModel 오늘 주제 머리글', () => {
  it('TC-HOME-053 REQ-HOME-004 GET /topics?date=KST오늘로 받아 ready가 된다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.todayDate).toBe('2026-10-27');
    expect(state.topic).toMatchObject({ status: 'ready', topic: { title: '가을 하늘', topicDate: '2026-10-27' } });
    expect(h.router.calls(TOPICS_TODAY)).toHaveLength(1);
  });

  it('TC-HOME-018 REQ-HOME-005 REQ-HOME-006 오늘 주제 404는 error가 아니라 ready(topic=null)이고 오늘 인기는 빈 ready다(/posts 요청 없음)', async () => {
    const h = createHomeHarness();
    h.router.set(TOPICS_TODAY, 'home/topics__404-not-found');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.topic).toEqual({ status: 'ready', topic: null });
    expect(state.popular).toEqual({ status: 'ready', posts: [] });
    expect(h.router.calls(POPULAR_TODAY)).toHaveLength(0);
  });

  it('REQ-HOME-005 주제 조회 5xx는 error이고 오늘 인기도 error다(다른 섹션은 정상)', async () => {
    const h = createHomeHarness();
    h.router.set(TOPICS_TODAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.topic).toEqual({ status: 'error' });
    expect(state.popular).toEqual({ status: 'error' });
    expect(state.yesterday.status).toBe('ready');
    expect(state.hero.kind).toBe('photo');
  });

  it('REQ-HOME-005 주제 400(미래 날짜)은 재시도 없이 error', async () => {
    const h = createHomeHarness();
    h.router.set(TOPICS_TODAY, () => json(400, { errorCode: 'BUSINESS_ERROR', message: '미래의 주제는 조회할 수 없습니다.' }));
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.topic).toEqual({ status: 'error' });
    expect(h.router.calls(TOPICS_TODAY)).toHaveLength(1);
  });

  it('REQ-HOME-005 retryTopic은 주제와 오늘 인기를 다시 불러온다', async () => {
    const h = createHomeHarness();
    h.router.set(TOPICS_TODAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.topic.status).toBe('error');
    h.router.set(TOPICS_TODAY, 'home/topics__open-2026-10-27');
    await finish(h, h.viewModel.retryTopic());
    expect(h.viewModel.state.topic.status).toBe('ready');
    expect(h.viewModel.state.popular.status).toBe('ready');
  });
});

describe('HomeViewModel 히어로 상태 (D-06)', () => {
  it('TC-HOME-001 REQ-HOME-007 /posts/today 응답 전 히어로는 loading이고 다른 섹션은 기다리지 않는다', async () => {
    const h = createHomeHarness();
    const gate = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__posted-approved.json').toResponse();
    });
    const shown = h.viewModel.onShown();
    await settle();

    const state = h.viewModel.state;
    expect(state.hero).toEqual({ kind: 'loading' });
    expect(state.popular.status).toBe('ready');
    expect(state.yesterday.status).toBe('ready');
    expect(state.weekly.status).toBe('ready');
    expect(h.banners.state.status).toBe('ready');

    gate.resolve();
    await finish(h, shown);
    expect(h.viewModel.state.hero.kind).toBe('photo');
  });

  it('TC-HOME-002 REQ-HOME-008 /posts/today 404는 no-open-topic이고 눌러도 아무 일도 없다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__404-no-open-topic');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'no-open-topic' });
    h.viewModel.onHeroPress();
    expect(h.upload.starts).toBe(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-003 REQ-HOME-009 isPosted=false는 empty이고 누르면 기존 업로드 진입(UploadEntry)이 시작된다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__not-posted');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
    h.viewModel.onHeroPress();
    expect(h.upload.starts).toBe(1);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-HOME-004 REQ-HOME-010 VALIDATING은 processing이고 달력에 postId가 없어도 유지된다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__posted-validating');
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-empty');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'processing' });
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
    h.viewModel.onHeroPress();
    expect(h.upload.starts).toBe(0);
  });

  it('TC-HOME-005 REQ-HOME-011 REQ-HOME-013 PENDING은 검수 대기 사진이고 썸네일은 달력의 같은 postId에서 가져오며 상세 API는 부르지 않는다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__posted-pending');
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-week-pending');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'photo', postId: MY_POST_ID, pending: true, thumbnailUrl: THUMB });
    expect(h.ff.calls.some((c) => c.path === `/posts/${MY_POST_ID}`)).toBe(false);
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
  });

  it('TC-HOME-006 REQ-HOME-012 APPROVED는 배지 없는 사진이다. 눌러도 이동은 없다(home.md 확인 필요 항목, 임시 동작)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'photo', postId: MY_POST_ID, pending: false, thumbnailUrl: THUMB });
    h.viewModel.onHeroPress();
    expect(h.navigator.calls).toEqual([]);
    expect(h.upload.starts).toBe(0);
    expect(h.ff.calls.some((c) => c.path === `/posts/${MY_POST_ID}`)).toBe(false);
  });

  it('TC-HOME-007 REQ-HOME-013 주간 기록이 실패하면 히어로는 error가 되지 않고 썸네일만 null이다', async () => {
    const h = createHomeHarness();
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__500-server-error');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.hero).toEqual({ kind: 'photo', postId: MY_POST_ID, pending: false, thumbnailUrl: null });
    expect(state.weekly).toEqual({ status: 'error' });
  });

  it('TC-HOME-007 달력이 같은 postId를 포함하지 않아도 썸네일은 null이다', async () => {
    const h = createHomeHarness();
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-empty');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toMatchObject({ kind: 'photo', thumbnailUrl: null });
  });

  it('TC-HOME-008 REQ-HOME-014 403(정지)은 empty(banned)이고 누르면 정지 안내만 뜨며 업로드 진입·같은 요청 재전송이 없다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__403-banned');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: true });

    h.viewModel.onHeroPress();
    expect(h.toasts.messages).toEqual([t('home.hero.banned')]);
    expect(h.upload.starts).toBe(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.router.calls(TODAY_POST)).toHaveLength(1);
  });

  it('TC-HOME-009 REQ-HOME-015 500은 error이고 다시 시도하면 /posts/today를 1회 다시 보내 성공 상태로 바뀐다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'error' });
    h.router.set(TODAY_POST, 'home/posts-today__posted-approved'); // 호출 기록을 새로 시작

    await finish(h, h.viewModel.retryHero());
    expect(h.router.calls(TODAY_POST)).toHaveLength(1);
    expect(h.viewModel.state.hero.kind).toBe('photo');
  });

  it('TC-HOME-009 연결 실패도 error이고 retry 중에는 loading으로 돌아간다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, networkFailure);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'error' });

    const gate = deferred<void>();
    h.router.set(TODAY_POST, async () => {
      await gate.promise;
      return loadFixture('home/posts-today__posted-approved.json').toResponse();
    });
    const retrying = h.viewModel.retryHero();
    await settle();
    expect(h.viewModel.state.hero).toEqual({ kind: 'loading' });
    gate.resolve();
    await finish(h, retrying);
    expect(h.viewModel.state.hero.kind).toBe('photo');
  });

  it('TC-HOME-010 REQ-HOME-016 반려 뒤 isPosted=false는 empty이고 error가 아니며 업로드 진입이 가능하다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__not-posted-after-reject');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'empty', banned: false });
    h.viewModel.onHeroPress();
    expect(h.upload.starts).toBe(1);
  });

  it('TC-HOME-011 REQ-HOME-017 알 수 없는 moderationStatus는 앱이 깨지지 않고 error 히어로다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__unknown-status');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'error' });
  });

  it('REQ-HOME-017 isPosted=false인데 postId가 있는 응답은 error 히어로다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, () => json(200, { topicDate: '2026-10-27', isPosted: false, postId: MY_POST_ID, moderationStatus: null }));
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero).toEqual({ kind: 'error' });
  });

  it('TC-HOME-014 REQ-HOME-048 D-17 401 UNAUTHORIZED는 refresh 1회 뒤 재전송되어 히어로가 정상 표시된다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, ['home/posts-today__401-unauthorized', 'home/posts-today__posted-approved']);
    h.router.set('POST /auth/refresh', 'auth/refresh__success');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('photo');
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(h.router.calls(TODAY_POST)).toHaveLength(2);
  });

  it('TC-HOME-046 삭제 뒤 홈이 다시 보이면 히어로는 empty이고 주간 칸이 사라진다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('photo');

    h.router.set(TODAY_POST, 'home/posts-today__not-posted');
    h.router.set(CALENDAR_OCT, 'home/posts-calendar__2026-10-empty');
    await finish(h, h.viewModel.onShown());
    const state = h.viewModel.state;
    expect(state.hero).toEqual({ kind: 'empty', banned: false });
    expect(state.weekly).toMatchObject({ status: 'ready', count: 0 });
  });

  it('TC-HOME-047 REQ-HOME-043 업로드 직후 홈이 다시 보이면 empty에서 processing으로 바뀐다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, 'home/posts-today__not-posted');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('empty');

    h.router.set(TODAY_POST, 'home/posts-today__posted-validating');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.hero.kind).toBe('processing');
  });
});

describe('HomeViewModel AI 피드백 카드 노출·요청 (REQ-HOME-034, 035)', () => {
  const AI_GET = `GET /posts/${MY_POST_ID}/ai-review`;
  const AI_POST = `POST /posts/${MY_POST_ID}/ai-review`;
  const aiRequests = (h: ReturnType<typeof createHomeHarness>) => h.ff.calls.filter((c) => c.path.endsWith('/ai-review'));

  it('TC-HOME-054 APPROVED + 주제 날짜가 KST 오늘이면 카드가 보이고 GET /ai-review를 1회 부른다(NONE → 요청 버튼)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toEqual({ kind: 'ready', postId: MY_POST_ID, status: 'NONE', canRequestAgain: false, requesting: false });
    expect(h.router.calls(AI_GET)).toHaveLength(1);
  });

  it.each([
    ['PENDING', 'home/posts-today__posted-pending'],
    ['VALIDATING', 'home/posts-today__posted-validating'],
    ['Empty', 'home/posts-today__not-posted'],
    ['NoOpenTopic', 'home/posts-today__404-no-open-topic'],
    ['403', 'home/posts-today__403-banned'],
    ['Error', 'home/posts-today__500-server-error'],
  ])('TC-HOME-054 히어로가 %s이면 카드도 ai-review 요청도 없다', async (_name, fixture) => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, fixture);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
    expect(aiRequests(h)).toEqual([]);
  });

  it('TC-HOME-054 지난 주제(topicDate가 KST 오늘이 아님)의 APPROVED는 카드가 없다', async () => {
    const h = createHomeHarness();
    h.router.set(TODAY_POST, () => json(200, { topicDate: '2026-10-26', isPosted: true, postId: MY_POST_ID, moderationStatus: 'APPROVED' }));
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
    expect(aiRequests(h)).toEqual([]);
  });

  it.each([
    ['ai-review/ai-review-get__processing', 'PROCESSING', false],
    ['ai-review/ai-review-get__completed', 'COMPLETED', false],
    ['ai-review/ai-review-get__failed-can-retry', 'FAILED', true],
    ['ai-review/ai-review-get__failed-cannot-retry', 'FAILED', false],
  ])('REQ-HOME-035 %s → 카드 %s (재요청 가능 %s)', async (fixture, status, canRequestAgain) => {
    const h = createHomeHarness();
    h.router.set(AI_GET, fixture);
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toEqual({ kind: 'ready', postId: MY_POST_ID, status, canRequestAgain, requesting: false });
  });

  it('REQ-HOME-035 ai-review가 404이면 카드를 숨기고, 실패(5xx)해도 카드만 숨길 뿐 다른 섹션은 그대로다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__404-not-found');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.ai).toEqual({ kind: 'hidden' });
    const failing = createHomeHarness();
    failing.router.set(AI_GET, 'ai-review/ai-review-get__500-server-error');
    await finish(failing, failing.viewModel.onShown());
    expect(failing.viewModel.state.ai).toEqual({ kind: 'hidden' });
    expect(failing.viewModel.state.hero.kind).toBe('photo');
    expect(failing.toasts.messages).toEqual([]);
  });

  it('TC-HOME-054 요청 버튼은 POST /ai-review를 1회 보내고 PROCESSING이 된다(요청 중 연타는 무시)', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    const gate = deferred<void>();
    h.router.set(AI_POST, async () => {
      await gate.promise;
      return loadFixture('ai-review/ai-review-post__202-processing.json').toResponse();
    });
    const first = h.viewModel.onAiRequestPress();
    await settle();
    expect(h.viewModel.state.ai).toMatchObject({ kind: 'ready', requesting: true });
    void h.viewModel.onAiRequestPress();
    void h.viewModel.onAiRequestPress();
    gate.resolve();
    await finish(h, first);
    expect(h.viewModel.state.ai).toEqual({ kind: 'ready', postId: MY_POST_ID, status: 'PROCESSING', canRequestAgain: false, requesting: false });
    expect(h.router.calls(AI_POST)).toHaveLength(1);
    expect(h.toasts.messages).toEqual([]);
  });

  it('FAILED(canRequestAgain)의 재요청도 같은 POST다', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__failed-can-retry');
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, 'ai-review/ai-review-post__202-processing');
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.viewModel.state.ai).toMatchObject({ status: 'PROCESSING' });
    expect(h.router.calls(AI_POST)).toHaveLength(1);
  });

  it('D-08 요청이 403이면 정지 안내 토스트만 뜨고 상태는 그대로이며 같은 요청을 다시 보내지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, 'ai-review/ai-review-post__403-banned');
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.toasts.messages).toEqual([t('ai.error.banned')]);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', requesting: false });
    expect(h.router.calls(AI_POST)).toHaveLength(1);
  });

  it('요청이 연결 실패하면 네트워크 토스트를 1회 띄우고 자동 재전송하지 않는다', async () => {
    const h = createHomeHarness();
    await finish(h, h.viewModel.onShown());
    h.router.set(AI_POST, networkFailure);
    await finish(h, h.viewModel.onAiRequestPress());
    expect(h.toasts.messages).toEqual([t('ai.error.network')]);
    expect(h.router.calls(AI_POST)).toHaveLength(1);
    expect(h.viewModel.state.ai).toMatchObject({ status: 'NONE', requesting: false });
  });

  it('COMPLETED의 자세히 보기는 게시물 상세의 AI 피드백 시트로 보내는 인자만 만든다(시트는 ai-review PR)', async () => {
    const h = createHomeHarness();
    h.router.set(AI_GET, 'ai-review/ai-review-get__completed');
    await finish(h, h.viewModel.onShown());
    h.viewModel.onAiDetailPress();
    expect(h.navigator.calls).toEqual([{ type: 'ai-review', postId: MY_POST_ID }]);
  });
});

describe('HomeViewModel 게스트 (D-05)', () => {
  it('TC-HOME-012 REQ-HOME-047 게스트는 개인 API를 부르지 않고 히어로 empty, 주간은 빈 7칸이며 주제·랭킹·배너만 부른다(인증 헤더 없음)', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await finish(h, h.viewModel.onShown());

    const paths = h.ff.calls.map((c) => c.path);
    expect(paths).not.toContain('/posts/today');
    expect(paths).not.toContain('/posts/calendar');
    expect(paths).not.toContain('/notifications/unread-status');
    expect(paths.some((p) => p.endsWith('/ai-review'))).toBe(false);
    expect(paths).toContain('/banners');
    expect(paths.filter((p) => p === '/topics')).toHaveLength(2);
    expect(paths.filter((p) => p === '/posts')).toHaveLength(2);

    const state = h.viewModel.state;
    expect(state.hero).toEqual({ kind: 'empty', banned: false });
    expect(state.weekly).toMatchObject({ status: 'ready', count: 0 });
    expect(state.ai).toEqual({ kind: 'hidden' });
    expect(state.popular.status).toBe('ready');
    expect(h.ff.calls.every((c) => c.headers['authorization'] === undefined)).toBe(true);
  });

  it('TC-HOME-013 REQ-HOME-018 게스트가 히어로를 누르면 토스트만 뜨고 업로드 진입·요청이 없다', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await finish(h, h.viewModel.onShown());
    const before = h.ff.calls.length;
    h.viewModel.onHeroPress();
    expect(h.toasts.messages).toEqual([t('home.guest.upload')]);
    expect(h.upload.starts).toBe(0);
    expect(h.navigator.calls).toEqual([]);
    expect(h.ff.calls).toHaveLength(before);
  });

  it('TC-HOME-049 REQ-HOME-046 게스트의 알림 버튼은 토스트만, 미읽음 조회도 없다', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await finish(h, h.viewModel.onShown());
    h.viewModel.onNotificationPress();
    await finish(h, h.viewModel.refreshUnread());
    expect(h.toasts.messages).toEqual([t('home.guest.notification')]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.ff.callsTo('GET /notifications/unread-status')).toHaveLength(0);
  });

  it('TC-HOME-022 REQ-HOME-032 게스트가 랭킹 사진을 누르면 토스트만 뜨고 이동·상세 요청이 없다', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    await finish(h, h.viewModel.onShown());
    const section = h.viewModel.state.popular;
    if (section.status !== 'ready') throw new Error('popular not ready');
    h.viewModel.onRankingItemPress('popular', section.posts[0]!.id);
    expect(h.toasts.messages).toEqual([t('home.guest.feed')]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.ff.calls.some((c) => /^\/posts\/[0-9a-f-]{36}$/.test(c.path))).toBe(false);
  });

  it('TC-BANR-009 TC-BANR-027 게스트도 배너를 보고 링크(새 탭)로 열 수 있어 로그인 요구가 없다. 랭킹이 실패해도 배너는 독립적이다', async () => {
    const h = createHomeHarness({ mode: 'guest' });
    h.router.set(POPULAR_TODAY, 'home/posts-list__500-server-error');
    await finish(h, h.viewModel.onShown());
    expect(h.viewModel.state.popular).toEqual({ status: 'error' });
    expect(h.banners.state.status).toBe('ready');

    expect(h.viewModel.bannerLinkFor('44444444-4444-4444-8444-444444444402')).toEqual({ kind: 'link', href: 'https://web.example.test/issues/2' });
    expect(h.toasts.messages).toEqual([]);
  });
});
