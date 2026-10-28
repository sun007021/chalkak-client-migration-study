import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { gated, ids, likeOf, openToday, range, ready } from '../../test/displayAsserts';
import { finish, settle } from '../../test/homeHarness';
import { createLikeServer } from '../../test/likeServer';
import { createPostHarness } from '../../test/postHarness';
import { FIRST_DATE, MINE, OTHER, TODAY, YESTERDAY, dateRoutes, postId, postsKey, topicKey } from '../../test/postRoutes';

const RECENT_P1 = postsKey(TODAY, 'recent');
const FIRST_ROUTES = {
  [topicKey(FIRST_DATE)]: 'display/topics__first-date-2026-09-17',
  [postsKey(FIRST_DATE, 'popular')]: 'display/posts-list__popular-3',
};
const topicCalls = (h: ReturnType<typeof createPostHarness>) => h.ff.calls.filter((c) => c.path === '/topics').map((c) => c.query.get('date'));

describe('DisplayViewModel 날짜 이동 (REQ-DISP-009, 010, 011, 012)', () => {
  it('TC-DISP-028 최초 전시일에서는 이전으로 이동하지 않고 요청도 없다. 다음 날에서 이전은 최초 전시일이다', async () => {
    const h = createPostHarness({ routes: { ...FIRST_ROUTES, ...dateRoutes('2026-09-18', 'popular', 'display/posts-list__popular-3') } });
    const vm = h.display();
    await openToday(h, vm, { date: FIRST_DATE });
    expect(vm.state.canGoPrevious).toBe(false);
    const calls = h.ff.calls.length;
    await finish(h, vm.selectPreviousDate());
    expect(h.ff.calls).toHaveLength(calls);
    expect(vm.state.date).toBe(FIRST_DATE);

    await finish(h, vm.selectNextDate());
    expect(vm.state.date).toBe('2026-09-18');
    await finish(h, vm.selectPreviousDate());
    expect(vm.state.date).toBe(FIRST_DATE);
    expect(topicCalls(h)).toContain(FIRST_DATE);
  });

  it('TC-DISP-029 오늘에서는 다음으로 이동하지 않는다. 어제에서 다음은 오늘이다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.canGoNext).toBe(false);
    const calls = h.ff.calls.length;
    await finish(h, vm.selectNextDate());
    expect(h.ff.calls).toHaveLength(calls);

    await finish(h, vm.selectPreviousDate());
    expect(vm.state).toMatchObject({ date: YESTERDAY, archive: true, canGoNext: true });
    await finish(h, vm.selectNextDate());
    expect(vm.state).toMatchObject({ date: TODAY, archive: false, requestSort: 'recent' });
  });

  it.each([
    ['2026-10-01', 'previous', '2026-09-30'],
    ['2027-01-01', 'previous', '2026-12-31'],
    ['2026-12-31', 'next', '2027-01-01'],
  ] as const)('TC-DISP-030 월·연 경계: %s에서 %s는 %s를 yyyy-MM-dd로 요청한다', async (from, dir, to) => {
    const h = createPostHarness({
      now: '2027-01-05T03:00:00Z',
      routes: { ...dateRoutes(from, 'popular', 'display/posts-list__popular-page1'), ...dateRoutes(to, 'popular', 'display/posts-list__popular-page1') },
    });
    const vm = h.display();
    await openToday(h, vm, { date: from });
    await finish(h, dir === 'previous' ? vm.selectPreviousDate() : vm.selectNextDate());
    expect(vm.state.date).toBe(to);
    expect(h.router.calls(topicKey(to))).toHaveLength(1);
    expect(h.router.calls(postsKey(to, 'popular'))).toHaveLength(1);
  });

  it('TC-DISP-031 이전 날짜의 주제가 404면 직전 전시와 날짜를 복원하고 토스트 "해당 날짜의 전시가 없어요"를 띄운다', async () => {
    const h = createPostHarness({ routes: { [topicKey(YESTERDAY)]: 'display/topics__404-not-found' } });
    const vm = h.display();
    await openToday(h, vm);
    const before = ids(ready(vm).posts);
    await finish(h, vm.selectPreviousDate());
    expect(vm.state).toMatchObject({ date: TODAY, archive: false, canGoPrevious: true, canGoNext: false });
    expect(vm.state.body.status).toBe('ready');
    expect(ids(ready(vm).posts)).toEqual(before);
    expect(h.toasts.messages).toEqual([t('display.date-missing')]);
    await finish(h, vm.selectPreviousDate()); // 최초 전시일 상수가 바뀌지 않아 다시 눌러도 시도한다
    expect(topicCalls(h).filter((d) => d === YESTERDAY)).toHaveLength(2);
  });

  it('TC-DISP-032 날짜 선택으로 건너뛴 날짜가 404여도 직전 성공 전시를 복원한다', async () => {
    const h = createPostHarness({ routes: { [topicKey('2026-10-10')]: 'display/topics__404-not-found' } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectDate('2026-10-10'));
    expect(vm.state.date).toBe(TODAY);
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([t('display.date-missing')]);
    expect(vm.state.canGoPrevious).toBe(true);
  });

  it('TC-DISP-033 날짜 이동 중 연결 실패면 직전 콘텐츠를 복원하고 토스트 "네트워크 연결을 확인해 주세요"를 띄운다', async () => {
    const h = createPostHarness({ routes: { [topicKey(YESTERDAY)]: () => Promise.reject(new TypeError('Failed to fetch')) } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectPreviousDate());
    expect(vm.state).toMatchObject({ date: TODAY });
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
  });

  it('TC-DISP-033 날짜 이동 중 5xx면 직전 콘텐츠를 복원하고 토스트 "전시를 불러오지 못했어요"를 띄운다', async () => {
    const h = createPostHarness({ routes: { [topicKey(YESTERDAY)]: 'display/topics__500-server-error' } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectPreviousDate());
    expect(vm.state.date).toBe(TODAY);
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([t('display.error')]);
  });

  it.each([
    ['2026-09-01', FIRST_DATE],
    ['2026-11-30', TODAY],
  ])('TC-DISP-034 범위 밖 날짜 %s를 고르면 범위 끝(%s)으로 맞춘다', async (picked, expected) => {
    const h = createPostHarness({ routes: { ...FIRST_ROUTES, ...dateRoutes('2026-10-05', 'popular', 'display/posts-list__popular-3') } });
    const vm = h.display();
    await openToday(h, vm, { date: '2026-10-05' });
    await finish(h, vm.selectDate(picked));
    expect(vm.state.date).toBe(expected);
  });

  it('TC-DISP-035 현재 보는 날짜를 다시 선택하면 재요청하지 않는다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    const calls = h.ff.calls.length;
    await finish(h, vm.selectDate(TODAY));
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('TC-DISP-038 이전 버튼 연타: 중간 날짜 응답이 늦게 와도 마지막 이동 날짜가 보인다', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const dates = ['2026-10-26', '2026-10-25', '2026-10-24'];
    const routes = Object.assign({}, ...dates.map((d, i) => ({ ...dateRoutes(d, 'popular', 'display/posts-list__popular-page1', `제목${d}`), [postsKey(d, 'popular')]: gated(gates[i]!, 'display/posts-list__popular-page1') })));
    const h = createPostHarness({ routes });
    const vm = h.display();
    await openToday(h, vm);
    const moves = [vm.selectPreviousDate(), vm.selectPreviousDate(), vm.selectPreviousDate()];
    await settle();
    expect(vm.state.date).toBe('2026-10-24'); // 이동하려는 날짜 기준으로 한 칸씩
    gates[2]!.resolve();
    await settle();
    gates[0]!.resolve();
    gates[1]!.resolve();
    await finish(h, Promise.all(moves));
    expect(vm.state.date).toBe('2026-10-24');
    expect(ready(vm).topicTitle).toBe('제목2026-10-24');
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-DISP-046 날짜 A→B로 이동한 뒤 A의 느린 응답이 와도 B를 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [postsKey(YESTERDAY, 'popular')]: gated(gate, 'display/posts-list__popular-page1') } });
    const vm = h.display();
    await openToday(h, vm);
    const toA = vm.selectPreviousDate();
    await settle();
    h.router.set(RECENT_P1, 'display/posts-list__recent-page1');
    const toB = vm.selectDate('2026-10-20');
    await settle();
    expect(vm.state.date).toBe('2026-10-20');
    gate.resolve();
    await finish(h, Promise.all([toA, toB]).catch(() => undefined));
    expect(vm.state.date).toBe('2026-10-20');
  });
});

describe('DisplayViewModel 오늘 기준과 자정 (REQ-DISP-015, TC-DISP-039, 040)', () => {
  it.each([
    ['2026-10-27T14:59:59Z', '2026-10-27'],
    ['2026-10-27T15:00:00Z', '2026-10-28'],
  ])('TC-DISP-039 가짜 시계 %s에서 날짜 상한(오늘)은 %s다', async (now, today) => {
    const h = createPostHarness({ now, routes: dateRoutes(today, 'recent', 'display/posts-list__recent-page1') });
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state).toMatchObject({ today, date: today, canGoNext: false });
  });

  it('TC-DISP-040 자정 이후 복귀하면 상한만 새 오늘로 바뀌고 보던 날짜는 그대로다', async () => {
    const h = createPostHarness({
      routes: { ...dateRoutes('2026-10-28', 'recent', 'display/posts-list__recent-page1') },
    });
    const vm = h.display();
    await openToday(h, vm);
    vm.onHidden();
    h.clock.setWallClock(Date.parse('2026-10-28T03:00:00Z'));
    await finish(h, vm.onShown());
    expect(vm.state).toMatchObject({ today: '2026-10-28', date: TODAY, canGoNext: true });
    expect(ready(vm).posts.length).toBeGreaterThan(0);
  });
});

describe('DisplayViewModel 추천 카드 (REQ-DISP-018, 019, TC-DISP-042, 043)', () => {
  it('아카이브는 앞 5개를 추천으로 쓰고 같은 좋아요 값을 가진다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    expect(ids(ready(vm).featured)).toEqual(range(202, 206));
    expect(ready(vm).featured[1]).toBe(ready(vm).posts[1]); // 같은 값(같은 항목)
  });

  it('TC-DISP-043 5개 미만이면 있는 만큼만 추천에 쓴다', async () => {
    const h = createPostHarness({ routes: { [postsKey(YESTERDAY, 'popular')]: 'display/posts-list__popular-3' } });
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    expect(ready(vm).featured).toHaveLength(3);
    expect(ready(vm).posts).toHaveLength(3);
  });

  it('오늘 날짜에서는 추천이 없다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    expect(ready(vm).featured).toEqual([]);
  });

  it('TC-DISP-042 같은 날짜를 다시 불러와도 추천 페이지를 유지하고 다른 날짜로 이동하면 0으로 돌아간다', async () => {
    const h = createPostHarness({ routes: dateRoutes('2026-10-25', 'popular', 'display/posts-list__popular-page1') });
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    vm.setFeaturedPage(1);
    expect(vm.state.featuredPage).toBe(1);
    await finish(h, vm.onTabReselect());
    expect(vm.state.featuredPage).toBe(1);
    await finish(h, vm.selectPreviousDate());
    expect(vm.state.featuredPage).toBe(0);
  });
});

describe('DisplayViewModel URL 반영·재선택 (REQ-DISP-010, 029)', () => {
  it('이미 같은 날짜·정렬이면 applyRoute는 아무것도 하지 않는다(URL을 되써도 다시 불러오지 않는다)', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    const calls = h.ff.calls.length;
    await finish(h, vm.applyRoute({ date: TODAY, sort: 'recent' }));
    await finish(h, vm.applyRoute({ date: null, sort: null }));
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('다른 정렬·날짜가 오면 사용자가 고른 것과 같게 바꾼다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.applyRoute({ date: TODAY, sort: 'popular' }));
    expect(vm.state.sort).toBe('popular');
    await finish(h, vm.applyRoute({ date: YESTERDAY, sort: 'popular' }));
    expect(vm.state).toMatchObject({ date: YESTERDAY, archive: true });
  });

  it('TC-DISP-029 전시 탭 재선택마다 scrollToTop이 1씩 늘고 첫 페이지를 조용히 재검증한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    const before = vm.state.scrollToTop;
    await finish(h, vm.onTabReselect());
    await finish(h, vm.onTabReselect());
    expect(vm.state.scrollToTop - before).toBe(2);
    expect(h.router.calls(RECENT_P1)).toHaveLength(3);
    expect(h.toasts.messages).toEqual([]);
  });

  it('REQ-DISP-030 onShown은 처음엔 로드, 이후에는 첫 페이지만 조용히 재검증한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await finish(h, vm.onShown());
    expect(vm.state.body.status).toBe('ready');
    expect(h.router.calls(RECENT_P1)).toHaveLength(1);
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(h.router.calls(RECENT_P1)).toHaveLength(2);
    expect(h.router.calls(topicKey(TODAY)).length).toBeGreaterThanOrEqual(1);
  });
});

describe('DisplayViewModel 좋아요와 변경 이벤트 (D-04, REQ-LIKE-009, TC-LIKE-004, 021)', () => {
  it('TC-LIKE-003 하트를 누르면 즉시 낙관 반영하고 서버 값으로 확정한다', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const vm = h.display();
    await openToday(h, vm);
    const press = vm.onLikePress(OTHER);
    expect(likeOf(vm, 202)).toEqual([true, 39]);
    await server.succeed();
    await finish(h, press);
    expect(likeOf(vm, 202)).toEqual([true, 39]);
    expect(server.methods).toEqual(['PUT']);
  });

  it('TC-LIKE-004 추천 카드와 그리드 카드는 항상 같은 값이다(아카이브)', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    const press = vm.onLikePress(OTHER);
    const featured = ready(vm).featured.find((p) => p.id === OTHER)!;
    const grid = ready(vm).posts.find((p) => p.id === OTHER)!;
    expect([featured.isLiked, featured.likeCount]).toEqual([true, 39]);
    expect([grid.isLiked, grid.likeCount]).toEqual([true, 39]);
    await server.succeed();
    await finish(h, press);
    const after = ready(vm);
    expect(after.featured.find((p) => p.id === OTHER)).toMatchObject({ isLiked: true, likeCount: 39 });
    expect(after.posts.find((p) => p.id === OTHER)).toMatchObject({ isLiked: true, likeCount: 39 });
  });

  it('TC-LIKE-009 실패하면 되돌리고 토스트를 띄운다', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const vm = h.display();
    await openToday(h, vm);
    const press = vm.onLikePress(OTHER);
    await server.invalid();
    await finish(h, press);
    expect(likeOf(vm, 202)).toEqual([false, 38]);
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
  });

  it('TC-LIKE-021 좋아요 완료 뒤 먼저 보낸 재검증 응답이 늦게 와도 완료된 좋아요를 덮지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const vm = h.display();
    await openToday(h, vm);
    h.router.set(RECENT_P1, gated(gate, 'display/posts-list__recent-page1'));
    const revalidating = vm.onTabReselect();
    await settle();
    const press = vm.onLikePress(OTHER);
    await server.succeed();
    await finish(h, press);
    gate.resolve(); // 좋아요 전에 읽은 값(isLiked=false, 38)
    await finish(h, revalidating);
    expect(likeOf(vm, 202)).toEqual([true, 39]);
  });

  it('REQ-LIKE-009 좋아요 요청이 진행 중인 게시물은 재검증 응답으로 되돌아가지 않는다', async () => {
    const h = createPostHarness();
    const server = createLikeServer(h, OTHER, { isLiked: false, likeCount: 38 });
    const vm = h.display();
    await openToday(h, vm);
    const press = vm.onLikePress(OTHER);
    await finish(h, vm.onTabReselect());
    expect(likeOf(vm, 202)).toEqual([true, 39]);
    await server.succeed();
    await finish(h, press);
  });

  it('다른 화면의 like 이벤트는 보이는 목록과 추천과 다른 정렬의 캐시에 모두 반영된다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectSort('popular'));
    h.changes.publish({ type: 'like', postId: OTHER, isLiked: true, likeCount: 50 });
    expect(likeOf(vm, 202)).toEqual([true, 50]);
    const back = vm.selectSort('recent'); // 최신순 캐시에도 반영되어 있다
    expect(likeOf(vm, 202)).toEqual([true, 50]);
    await finish(h, back);
  });

  it('title 이벤트는 목록 항목의 제목을 바꾼다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.changes.publish({ type: 'title', postId: MINE, title: '새 제목' });
    expect(ready(vm).posts.find((p) => p.id === MINE)!.title).toBe('새 제목');
    h.changes.publish({ type: 'title', postId: MINE, title: null });
    expect(ready(vm).posts.find((p) => p.id === MINE)!.title).toBeNull();
  });

  it('TC-FEED-044 removed 이벤트는 목록·추천·캐시에서 빼고 늦은 응답이 되살리지 못한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    h.changes.publish({ type: 'removed', postId: OTHER });
    expect(ids(ready(vm).posts)).not.toContain('202');
    expect(ids(ready(vm).featured)).not.toContain('202');
  });

  it('removed 뒤 재검증 응답에 같은 게시물이 있어도 보이지 않는다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.changes.publish({ type: 'removed', postId: MINE });
    await finish(h, vm.onTabReselect());
    expect(ids(ready(vm).posts)).not.toContain('201');
    expect(ready(vm).posts).toHaveLength(19);
  });

  it('removed 이벤트는 다른 정렬 캐시에서도 뺀다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectSort('popular'));
    h.changes.publish({ type: 'removed', postId: postId(203) });
    const back = vm.selectSort('recent');
    expect(ids(ready(vm).posts)).not.toContain('203');
    await finish(h, back);
  });

  it('TC-LIKE-010 좋아요 404는 롤백 뒤 목록에서 빼고 토스트를 띄운다', async () => {
    const h = createPostHarness({ routes: { [`PUT /posts/${OTHER}/likes`]: 'like/posts-likes-put__404-not-found' } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onLikePress(OTHER));
    expect(ids(ready(vm).posts)).not.toContain('202');
    expect(h.toasts.messages).toEqual([t('like.error.generic')]);
  });
});
