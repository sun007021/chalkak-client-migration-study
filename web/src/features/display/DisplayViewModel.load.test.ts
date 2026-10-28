import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated, ids, openToday, ready, range } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { finish, settle } from '../../test/homeHarness';
import { loadFixture } from '../../test/fixtures';
import { createPostHarness } from '../../test/postHarness';
import { FIRST_DATE, MINE, OTHER, TODAY, YESTERDAY, postsKey, topicKey } from '../../test/postRoutes';

const RECENT_P1 = postsKey(TODAY, 'recent');

describe('DisplayViewModel 첫 로딩 (REQ-DISP-001, 002, 011)', () => {
  it('TC-DISP-001 REQ-DISP-011 진입 직후 응답 전에는 Loading이고 날짜 이동 버튼은 비활성이다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({
      routes: {
        [topicKey(TODAY)]: async () => {
          await gate.promise;
          return loadFixture('display/topics__open-2026-10-27.json').toResponse();
        },
      },
    });
    const vm = h.display();
    const loading = vm.applyRoute({ date: null, sort: null });
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' });
    expect(vm.state).toMatchObject({ canGoPrevious: false, canGoNext: false, date: TODAY });
    gate.resolve();
    await finish(h, loading);
    expect(vm.state.body.status).toBe('ready');
    expect(vm.state.canGoPrevious).toBe(true);
    expect(vm.state.canGoNext).toBe(false); // 오늘
  });

  it('TC-DISP-002 REQ-DISP-001 REQ-DISP-002 오늘 최신순: /topics?date=오늘을 먼저 부르고 topicDate로 /posts를 부른다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    expect(h.ff.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /topics', 'GET /posts']);
    expect(h.router.calls(topicKey(TODAY))).toHaveLength(1);
    expect(h.router.calls(RECENT_P1)).toHaveLength(1);
    expect(vm.state).toMatchObject({ today: TODAY, date: TODAY, sort: 'recent', requestSort: 'recent', archive: false });
    const body = ready(vm);
    expect(body).toMatchObject({ topicTitle: '가을 하늘', hasNext: true, refreshing: false, paging: false, featured: [] });
    expect(ids(body.posts)).toEqual(range(202, 205).concat(['201'], range(206, 220)));
    expect(body.posts[0]).toMatchObject({ id: OTHER, likeCount: 38, isLiked: false, isMine: false, title: '은행잎' });
    expect(body.posts[4]).toMatchObject({ id: MINE, likeCount: 10, isMine: true });
    expect(body.posts[1]).toMatchObject({ isLiked: true, likeCount: 37 });
  });

  it('REQ-DISP-001 다른 화면이 날짜·정렬을 지정해 열면 그 값으로 연다(홈 더보기: 어제 인기순)', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY, sort: 'popular' });
    expect(h.router.calls(topicKey(YESTERDAY))).toHaveLength(1);
    expect(h.router.calls(postsKey(YESTERDAY, 'popular'))).toHaveLength(1);
    expect(vm.state).toMatchObject({ date: YESTERDAY, archive: true, requestSort: 'popular' });
  });

  it('REQ-DISP-001 오늘 인기순으로 열면(홈 오늘 인기 더보기) 정렬 탭이 있는 오늘 모드에서 popular를 요청한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { date: TODAY, sort: 'popular' });
    expect(vm.state).toMatchObject({ date: TODAY, sort: 'popular', requestSort: 'popular', archive: false });
    expect(h.router.calls(postsKey(TODAY, 'popular'))).toHaveLength(1);
  });

  it.each([
    ['2026-09-01', FIRST_DATE],
    ['2020-01-01', FIRST_DATE],
    ['2026-11-30', TODAY],
    ['garbage', TODAY],
  ])('REQ-DISP-009 진입 날짜 %s는 범위 안(%s)으로 맞춘다', async (input, expected) => {
    const h = createPostHarness({
      routes: {
        [topicKey(FIRST_DATE)]: 'display/topics__first-date-2026-09-17',
        [postsKey(FIRST_DATE, 'popular')]: 'display/posts-list__popular-3',
      },
    });
    const vm = h.display();
    await openToday(h, vm, { date: input });
    expect(vm.state.date).toBe(expected);
  });

  it('TC-DISP-009 주제 phase가 BEFORE_OPEN이어도 posts를 조회해 있는 사진을 보여 준다', async () => {
    const h = createPostHarness({ routes: { [topicKey(TODAY)]: () => json(200, { ...(loadFixture('display/topics__before-open.json').json as object), topicDate: TODAY }) } });
    const vm = h.display();
    await openToday(h, vm);
    expect(h.router.calls(RECENT_P1)).toHaveLength(1);
    expect(ready(vm).posts).toHaveLength(20);
  });

  it('REQ-DISP-002 /topics 응답 topicDate가 요청 날짜와 다르면 잘못된 응답이라 오류 화면이다', async () => {
    const h = createPostHarness({ routes: { [topicKey(TODAY)]: 'display/topics__open-2026-10-26' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body.status).toBe('error');
    expect(h.router.calls(RECENT_P1)).toHaveLength(0);
  });
});

describe('DisplayViewModel 빈 상태와 오류 (REQ-DISP-014, 032, D-20)', () => {
  it('TC-DISP-006 REQ-DISP-014 오늘 주제가 404면 빈 상태이고 오류가 아니다(posts는 부르지 않는다)', async () => {
    const h = createPostHarness({ routes: { [topicKey(TODAY)]: 'display/topics__404-not-found' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'empty' });
    expect(vm.state.date).toBe(TODAY);
    expect(h.router.calls(RECENT_P1)).toHaveLength(0);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-DISP-007 주제는 있는데 posts가 404면 빈 상태이고 날짜 이동은 가능하다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P1]: 'display/posts-list__404-topic-not-found' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'empty' });
    expect(vm.state.canGoPrevious).toBe(true);
  });

  it('REQ-DISP-014 사진 0장(200, 빈 posts)도 빈 상태다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P1]: 'display/posts-list__page99-empty' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'empty' });
  });

  it('TC-DISP-005 REQ-DISP-014 /posts 500이면 요청한 날짜를 유지한 오류 상태이고 다시 시도하면 같은 날짜로 재요청해 성공한다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P1]: 'display/posts-list__500-server-error' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'error', network: false });
    expect(vm.state.date).toBe(TODAY);
    expect(h.toasts.messages).toEqual([]);
    const gate = deferred<void>();
    h.router.set(RECENT_P1, gated(gate, 'display/posts-list__recent-page1'));
    const retry = vm.retry();
    await settle();
    expect(vm.state.body).toEqual({ status: 'loading' }); // 상태 표: 오류 → 다시 시도 → Loading
    expect(vm.state.date).toBe(TODAY);
    gate.resolve();
    await finish(h, retry);
    expect(ready(vm).posts).toHaveLength(20);
    expect(h.router.calls(topicKey(TODAY)).length).toBeGreaterThanOrEqual(1);
  });

  it('TC-DISP-005 연결 실패면 network=true인 오류 상태다', async () => {
    const h = createPostHarness({ routes: { [topicKey(TODAY)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'error', network: true });
  });

  it.each(['display/posts-list__400-future-date', 'display/posts-list__400-bad-query'])('TC-DISP-008 D-02 %s는 message와 무관하게 일반 오류 상태(다시 시도)이고 자동 재시도하지 않는다', async (fixture) => {
    const h = createPostHarness({ routes: { [RECENT_P1]: fixture } });
    const vm = h.display();
    await openToday(h, vm);
    await h.clock.advance(10_000);
    expect(vm.state.body).toEqual({ status: 'error', network: false });
    expect(h.router.calls(RECENT_P1)).toHaveLength(1);
  });

  it('REQ-DISP-034 항목 계약 위반(likeCount 음수)이면 그 응답은 잘못된 응답으로 처리해 오류 상태다', async () => {
    const page = loadFixture('display/posts-list__recent-page1.json').json as { posts: { likeCount: number }[] };
    const bad = { ...page, posts: page.posts.map((p, i) => (i === 3 ? { ...p, likeCount: -1 } : p)) };
    const h = createPostHarness({ routes: { [RECENT_P1]: () => json(200, bad) } });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.body).toEqual({ status: 'error', network: false });
  });
});

describe('DisplayViewModel 취소·계정 전환 (D-20, D-17)', () => {
  it('TC-DISP-048 화면 이탈(onHidden)로 취소된 요청은 오류 화면·토스트가 되지 않고 다시 보이면 다시 로드한다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({
      routes: {
        [RECENT_P1]: async () => {
          await gate.promise;
          return loadFixture('display/posts-list__recent-page1.json').toResponse();
        },
      },
    });
    const vm = h.display();
    void vm.applyRoute({ date: null, sort: null });
    await settle();
    vm.onHidden();
    gate.resolve();
    await settle();
    expect(vm.state.body.status).not.toBe('error');
    expect(vm.state.body.status).not.toBe('ready'); // 늦은 응답은 버려진다
    expect(h.toasts.messages).toEqual([]);
    h.router.set(RECENT_P1, 'display/posts-list__recent-page1');
    await finish(h, vm.onShown());
    expect(ready(vm).posts).toHaveLength(20);
  });

  it('TC-DISP-049 계정 전환(reset) 뒤에는 이전 계정의 목록·isLiked가 남지 않고 이전 계정의 늦은 응답은 무시된다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    expect(ready(vm).posts[1]!.isLiked).toBe(true);
    // 첫 호출(A의 재검증)은 붙잡아 A의 값(203 좋아요)으로 늦게 답하고, 그 뒤 호출(B의 재로드)은 B의 값으로 답한다.
    h.router.set(RECENT_P1, [
      async () => {
        await gate.promise;
        return loadFixture('display/posts-list__recent-page1.json').toResponse();
      },
      'display/posts-list__guest-page1',
    ]);
    void vm.onShown();
    await settle();
    vm.resetForAccountChange();
    // 화면이 보이는 중이므로 곧바로 새 계정으로 다시 불러온다(W5 홈과 같은 규칙).
    await settle();
    gate.resolve();
    await finish(h, Promise.resolve());
    await settle();
    expect(vm.state.body.status).toBe('ready');
    expect(ready(vm).posts.every((p) => !p.isLiked)).toBe(true); // A의 isLiked가 B 화면에 보이지 않는다
    expect(h.router.calls(RECENT_P1)).toHaveLength(2);
  });

  it('TC-DISP-049 reset 뒤 다시 보이면 캐시 없이 새로 불러오고 새 계정의 값으로 채운다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    vm.resetForAccountChange();
    h.router.set(RECENT_P1, 'display/posts-list__guest-page1');
    const before = h.router.calls(RECENT_P1).length;
    await finish(h, vm.onShown());
    expect(h.router.calls(RECENT_P1).length - before).toBe(1);
    expect(ready(vm).posts.every((p) => !p.isLiked)).toBe(true);
    expect(vm.state.sort).toBe('recent');
  });
});

describe('DisplayViewModel 게스트 (D-05, REQ-DISP-033, 035)', () => {
  it('TC-DISP-053 게스트는 Authorization 없이 /topics·/posts만 부르고 응답의 isLiked·isMine을 모두 false로 다룬다', async () => {
    const h = createPostHarness({ mode: 'guest', routes: { [RECENT_P1]: 'display/posts-list__recent-page1' } }); // 회원 fixture(좋아요·내 글 포함)를 받아도
    const vm = h.display();
    await openToday(h, vm);
    expect(h.ff.calls.every((c) => c.headers['authorization'] === undefined)).toBe(true);
    expect(h.ff.calls.map((c) => c.path)).toEqual(['/topics', '/posts']);
    expect(ready(vm).posts.every((p) => p.isLiked === false && p.isMine === false)).toBe(true);
  });

  it('TC-DISP-054 게스트가 사진을 누르면 토스트 "게시물 피드를 보려면 로그인이 필요해요"이고 이동·요청이 없다', async () => {
    const h = createPostHarness({ mode: 'guest' });
    const vm = h.display();
    await openToday(h, vm);
    const calls = h.ff.calls.length;
    vm.onPostPress(OTHER);
    expect(h.toasts.messages).toEqual([t('nav.guest.feed')]);
    expect(h.navigator.calls).toEqual([]);
    expect(h.ff.calls).toHaveLength(calls);
    expect(h.ff.calls.filter((c) => c.path.startsWith('/posts/') && c.method === 'GET')).toEqual([]);
  });

  it('TC-LIKE-014 게스트가 하트를 누르면 상태 변화 없이 토스트 "좋아요를 누르려면 로그인이 필요해요"이고 요청이 없다', async () => {
    const h = createPostHarness({ mode: 'guest' });
    const vm = h.display();
    await openToday(h, vm);
    const calls = h.ff.calls.length;
    const before = ready(vm).posts.map((p) => [p.isLiked, p.likeCount]);
    await vm.onLikePress(OTHER);
    expect(h.toasts.messages).toEqual([t('nav.guest.like')]);
    expect(ready(vm).posts.map((p) => [p.isLiked, p.likeCount])).toEqual(before);
    expect(h.ff.calls).toHaveLength(calls);
  });
});

describe('DisplayViewModel 상세 진입 (TC-DISP-055)', () => {
  it('회원이 사진을 누르면 목록의 id·이미지 URL·likeCount·isLiked를 시드로 상세를 연다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    vm.onPostPress(OTHER);
    expect(h.navigator.calls).toHaveLength(1);
    expect(h.navigator.calls[0]).toMatchObject({
      postId: OTHER,
      seed: {
        id: OTHER,
        authorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        originalImageUrl: `https://cdn.example.test/posts/${OTHER}/original.webp`,
        thumbnailImageUrl: `https://cdn.example.test/posts/${OTHER}/thumbnail.webp`,
        title: '은행잎',
        likeCount: 38,
        isLiked: false,
        isMine: false,
      },
    });
    expect(h.ff.calls.filter((c) => c.path.startsWith('/posts/'))).toEqual([]); // 상세 조회는 상세 화면의 몫
  });

  it('시드는 지금 보이는 좋아요 값이다(낙관 반영 포함)', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    void vm.onLikePress(OTHER);
    vm.onPostPress(OTHER);
    expect(h.navigator.calls[0]!.seed).toMatchObject({ isLiked: true, likeCount: 39 });
  });

  it('목록에 없는 id를 누르면 아무 일도 없다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    vm.onPostPress('22222222-2222-4222-8222-222222222999');
    expect(h.navigator.calls).toEqual([]);
    expect(h.toasts.messages).toEqual([]);
  });
});
