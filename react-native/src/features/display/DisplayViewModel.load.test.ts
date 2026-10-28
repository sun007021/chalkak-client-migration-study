import { json, networkFailure } from '../../core/http/__testing__/FakeTransport';
import { fixtureBody, fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { d } from '../../core/time/__testing__/helpers';
import { t } from '../../shared/copy';
import { flush } from '../home/__testing__/createHomeHarness';
import { createDisplayHarness, gatedRoute, ID, q } from './__testing__/createDisplayHarness';

const TODAY_RECENT = q('2026-10-27', 'recent', 1);
const TOPIC_TODAY = 'GET /topics?date=2026-10-27';
const OPEN_TOPIC = fixtureBody<Record<string, unknown>>('display/topics__open-2026-10-27');

describe('DisplayViewModel 첫 로드', () => {
  it('TC-DISP-001 응답 전에는 Loading이고 날짜 이동 버튼은 비활성이다', async () => {
    const h = await createDisplayHarness();
    const gate = gatedRoute(h.router, TOPIC_TODAY, 'display/topics__open-2026-10-27');
    const loading = h.viewModel.onShown();
    await flush();
    const s = h.viewModel.getSnapshot();
    expect(s).toMatchObject({
      status: 'loading',
      navigationLocked: true,
      canGoPrevious: false,
      canGoNext: false,
    });
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', navigationLocked: false });
  });

  it('TC-DISP-002 /topics를 먼저 부르고 응답 topicDate로 /posts(recent, page=1, pageSize=20)를 불러 매핑한다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    const paths = h.transport.requests.map((r) => new URL(r.url).pathname.replace('/api/v1', ''));
    expect(paths).toEqual(['/topics', '/posts']);
    expect(Object.fromEntries(new URL(h.transport.requests[1].url).searchParams)).toEqual({
      topicDate: '2026-10-27',
      sort: 'recent',
      page: '1',
      pageSize: '20',
    });
    const s = h.viewModel.getSnapshot();
    expect(s).toMatchObject({
      status: 'content',
      mode: 'latest',
      sort: 'recent',
      hasNext: true,
      topic: { title: '가을 하늘' },
    });
    expect(s.date.toString()).toBe('2026-10-27');
    expect(s.photos).toHaveLength(20);
    expect(s.photos[0]).toMatchObject({
      id: ID('02'),
      likeCount: 38,
      isLiked: false,
      isMine: false,
    });
  });

  it('TC-DISP-005 최초 로드가 500이면 요청 날짜를 유지한 오류 상태이고 다시 시도하면 같은 날짜로 재요청한다', async () => {
    const h = await createDisplayHarness();
    h.router.set(TODAY_RECENT, (_r, i) =>
      i < 3
        ? fixtureResponse('display/posts-list__500-server-error')
        : fixtureResponse('display/posts-list__recent-page1'),
    );
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', errorKind: 'generic' });
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-27');
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', errorKind: null });
    expect(topicDates(h)).toEqual(['2026-10-27', '2026-10-27']);
  });

  it('TC-DISP-005 연결 실패면 오류 종류가 network(문구 "네트워크 연결을 확인해 주세요.")다', async () => {
    const h = await createDisplayHarness({ routes: { [TOPIC_TODAY]: networkFailure() } });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', errorKind: 'network' });
  });

  it('TC-DISP-006 오늘 주제가 404이면 빈 상태이고 오류가 아니다', async () => {
    const h = await createDisplayHarness({
      routes: { [TOPIC_TODAY]: 'display/topics__404-not-found' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'empty', errorKind: null });
    expect(h.toast.messages).toEqual([]);
  });

  it('TC-DISP-007 posts가 404이면 빈 상태이고 날짜 이동은 막히지 않는다', async () => {
    const h = await createDisplayHarness({
      routes: { [TODAY_RECENT]: 'display/posts-list__404-topic-not-found' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({
      status: 'empty',
      navigationLocked: false,
      canGoPrevious: true,
    });
  });

  it.each(['display/posts-list__400-future-date', 'display/posts-list__400-bad-query'])(
    'TC-DISP-008 %s는 일반 오류 상태(다시 시도)이고 재시도하지 않는다',
    async (fixture) => {
      const h = await createDisplayHarness({ routes: { [TODAY_RECENT]: fixture } });
      await h.viewModel.onShown();
      expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', errorKind: 'generic' });
      expect(h.callsOf(TODAY_RECENT)).toBe(1);
    },
  );

  it.each([
    ['BEFORE_OPEN', 'content'],
    ['CLOSED', 'content'],
  ])('TC-DISP-009 phase=%s여도 posts를 조회해 사진을 보여 준다', async (phase, status) => {
    const h = await createDisplayHarness({
      routes: { [TOPIC_TODAY]: () => json(200, { ...OPEN_TOPIC, phase }) },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status, topic: { phase } });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
  });

  it('TC-DISP-009 phase와 무관하게 사진이 없으면 빈 상태', async () => {
    const h = await createDisplayHarness({
      routes: {
        [TOPIC_TODAY]: () => json(200, { ...OPEN_TOPIC, phase: 'BEFORE_OPEN' }),
        [TODAY_RECENT]: () =>
          json(200, { currentPage: 1, pageSize: 20, hasNext: false, randomSeed: null, posts: [] }),
      },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().status).toBe('empty');
  });

  it('TC-DISP-010 이미 사진이 보일 때 재검증이 실패하면 콘텐츠를 유지하고 토스트만 띄운다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.router.set(TODAY_RECENT, 'display/posts-list__500-server-error');
    await h.viewModel.onTabReselected();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content', refreshing: false });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
    expect(h.toast.messages).toEqual([t('display.error')]);
  });

  it('TC-DISP-048 화면 이탈로 취소된 요청은 오류 토스트·오류 화면 없이 끝나고 재진입하면 다시 로드한다', async () => {
    const h = await createDisplayHarness();
    const gate = gatedRoute(h.router, TODAY_RECENT, 'display/posts-list__recent-page1');
    const loading = h.viewModel.onShown();
    await flush();
    h.viewModel.onHidden();
    gate.release();
    await loading;
    expect(h.viewModel.getSnapshot().status).not.toBe('error');
    expect(h.toast.messages).toEqual([]);
    h.router.set(TODAY_RECENT, 'display/posts-list__recent-page1');
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'content' });
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
  });

  it('TC-LIKE-025 좋아요·게시물 변경 구독은 화면이 가려진 동안(상세가 위에 있을 때)에도 dispose까지 유지된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.viewModel.onHidden();
    expect([h.likes.listenerCount, h.changes.listenerCount]).toEqual([1, 1]);
    h.likes.emit({ kind: 'updated', snapshot: { postId: ID('02'), likeCount: 99, isLiked: true } });
    expect(h.viewModel.getSnapshot().photos.find((p) => p.id === ID('02'))).toMatchObject({
      likeCount: 99,
      isLiked: true,
    });
    h.viewModel.dispose();
    expect([h.likes.listenerCount, h.changes.listenerCount]).toEqual([0, 0]);
  });

  it('TC-DISP-049 계정 전환(clearAll) 뒤에는 이전 계정의 isLiked·캐시·시드가 보이지 않고 새로 불러온다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    await h.viewModel.selectSort('random');
    h.viewModel.clearAll();
    expect(h.viewModel.getSnapshot().photos).toEqual([]);
    expect(h.viewModel.getSnapshot().status).toBe('loading');
    const before = h.callsOf(q('2026-10-27', 'random', 1));
    await h.viewModel.onShown();
    const calls = h.router.calls(q('2026-10-27', 'random', 1));
    expect(calls.length).toBe(before + 1);
    expect(new URL(calls.at(-1)!.url).searchParams.has('randomSeed')).toBe(false);
  });

  it('TC-DISP-050 오프라인 진입은 오류 + 다시 시도이고 온라인 복귀 뒤 다시 시도하면 성공한다', async () => {
    const h = await createDisplayHarness({
      routes: {
        [TOPIC_TODAY]: [
          networkFailure(),
          networkFailure(),
          networkFailure(),
          'display/topics__open-2026-10-27',
        ],
      },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot()).toMatchObject({ status: 'error', errorKind: 'network' });
    await h.viewModel.retry();
    expect(h.viewModel.getSnapshot().status).toBe('content');
  });

  it('TC-DISP-056 다른 화면이 날짜를 지정해 열면(업로드 성공 등) 그 날짜의 전시를 연다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-26'));
    expect(h.viewModel.getSnapshot().date.toString()).toBe('2026-10-26');
    expect(h.viewModel.getSnapshot().mode).toBe('archive');
  });

  it('REQ-DISP-001 홈 랭킹 더보기(오늘, 인기순)로 열면 오늘 모드에서 popular가 선택된다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.openDate(d('2026-10-27'), 'popular');
    expect(h.viewModel.getSnapshot()).toMatchObject({ mode: 'latest', sort: 'popular' });
    expect(h.callsOf(q('2026-10-27', 'popular', 1))).toBe(1);
  });
});

describe('DisplayViewModel 게스트와 상세 진입', () => {
  it('TC-DISP-053 게스트는 Authorization 없이 /topics·/posts만 불러 목록을 본다', async () => {
    const h = await createDisplayHarness({
      mode: 'guest',
      routes: { [TODAY_RECENT]: 'display/posts-list__guest-page1' },
    });
    await h.viewModel.onShown();
    expect(h.viewModel.getSnapshot().photos).toHaveLength(20);
    expect(h.transport.requests.every((r) => r.headers.Authorization === undefined)).toBe(true);
    expect(h.transport.requests.map((r) => new URL(r.url).pathname.replace('/api/v1', ''))).toEqual(
      ['/topics', '/posts'],
    );
  });

  it('TC-DISP-054 게스트가 사진을 누르면 토스트만 뜨고 상세 요청과 화면 이동이 없다', async () => {
    const h = await createDisplayHarness({
      mode: 'guest',
      routes: { [TODAY_RECENT]: 'display/posts-list__guest-page1' },
    });
    await h.viewModel.onShown();
    const requests = h.transport.requests.length;
    h.viewModel.onPhotoPress(ID('02'));
    expect(h.toast.messages).toEqual([t('guest.feed')]);
    expect(h.navigator.opened).toEqual([]);
    expect(h.transport.requests).toHaveLength(requests);
  });

  it('TC-DISP-055 회원이 사진을 누르면 목록 항목을 시드로 상세를 연다', async () => {
    const h = await createDisplayHarness();
    await h.viewModel.onShown();
    h.viewModel.onPhotoPress(ID('03'));
    const seed = h.viewModel.getSnapshot().photos.find((p) => p.id === ID('03'));
    expect(h.navigator.opened).toEqual([{ postId: ID('03'), seed }]);
    expect(h.toast.messages).toEqual([]);
  });
});

const topicDates = (h: Awaited<ReturnType<typeof createDisplayHarness>>) =>
  h.transport.requests
    .filter((r) => new URL(r.url).pathname.endsWith('/topics'))
    .map((r) => new URL(r.url).searchParams.get('date'));
