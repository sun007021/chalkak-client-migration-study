import { t } from '../../copy/ko';
import { deferred } from '../../test/deferred';
import { failWhile, gated, ids, openToday, range, ready } from '../../test/displayAsserts';
import { json } from '../../test/fixtureRouter';
import { finish, settle } from '../../test/homeHarness';
import { loadFixture } from '../../test/fixtures';
import { createPostHarness } from '../../test/postHarness';
import { TODAY, YESTERDAY, postsKey, topicKey } from '../../test/postRoutes';

const RECENT_P1 = postsKey(TODAY, 'recent');
const RECENT_P2 = postsKey(TODAY, 'recent', 2);
const POPULAR_P1 = postsKey(TODAY, 'popular');
const RANDOM_P1 = postsKey(TODAY, 'random');
const SEED = 'seed_abc123';
const RANDOM_P2 = postsKey(TODAY, 'random', 2, SEED);
const RANDOM_P1_SEEDED = postsKey(TODAY, 'random', 1, SEED);

const RECENT_IDS = range(202, 205).concat(['201'], range(206, 220));
const POPULAR_IDS = range(202, 220).concat(['201']);
const postsRequests = (h: ReturnType<typeof createPostHarness>) => h.ff.calls.filter((c) => c.path === '/posts');

describe('DisplayViewModel 정렬 (REQ-DISP-003, 004, 005)', () => {
  it('TC-DISP-011 정렬을 고르면 그 sort로 요청하고 기본은 recent다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    expect(vm.state.sort).toBe('recent');
    await finish(h, vm.selectSort('popular'));
    expect(vm.state).toMatchObject({ sort: 'popular', requestSort: 'popular' });
    expect(h.router.calls(POPULAR_P1)).toHaveLength(1);
    await finish(h, vm.selectSort('random'));
    expect(vm.state).toMatchObject({ sort: 'random', requestSort: 'random' });
    expect(h.router.calls(RANDOM_P1)).toHaveLength(1);
  });

  it('TC-DISP-012 정렬을 바꾸면 새 결과가 올 때까지 기존 사진을 유지하고(refreshing), 도착하면 교체한다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [POPULAR_P1]: gated(gate, 'display/posts-list__popular-page1') } });
    const vm = h.display();
    await openToday(h, vm);
    const pending = vm.selectSort('popular');
    await settle();
    expect(vm.state.sort).toBe('popular');
    expect(vm.state.body.status).toBe('ready');
    expect(ready(vm)).toMatchObject({ refreshing: true });
    expect(ids(ready(vm).posts)).toEqual(RECENT_IDS);
    gate.resolve();
    await finish(h, pending);
    expect(ready(vm).refreshing).toBe(false);
    expect(ids(ready(vm).posts)).toEqual(POPULAR_IDS);
  });

  it('TC-DISP-012 이미 본 (날짜, 정렬)로 돌아가면 캐시를 즉시 보여 준다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectSort('popular'));
    const pending = vm.selectSort('recent');
    expect(ids(ready(vm).posts)).toEqual(RECENT_IDS); // await 없이 곧바로
    await finish(h, pending);
    expect(ids(ready(vm).posts)).toEqual(RECENT_IDS);
    expect(h.toasts.messages).toEqual([]);
  });

  it('REQ-DISP-005 지난 날짜(아카이브)에서는 정렬 선택을 무시한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { date: YESTERDAY });
    const calls = h.ff.calls.length;
    await finish(h, vm.selectSort('random'));
    expect(h.ff.calls).toHaveLength(calls);
    expect(vm.state).toMatchObject({ date: YESTERDAY, sort: 'recent', requestSort: 'popular' });
  });

  it('TC-DISP-014 오늘에서 랜덤순을 보다가 과거 날짜로 갔다 돌아오면 랜덤순이 복원된다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.selectSort('random'));
    await finish(h, vm.selectPreviousDate());
    expect(vm.state).toMatchObject({ date: YESTERDAY, archive: true, sort: 'random', requestSort: 'popular' });
    await finish(h, vm.selectNextDate());
    expect(vm.state).toMatchObject({ date: TODAY, archive: false, sort: 'random', requestSort: 'random' });
  });
});

describe('DisplayViewModel 랜덤순과 seed (REQ-DISP-006, F3~F5)', () => {
  it('TC-DISP-015 TC-DISP-016 첫 페이지는 seed 없이 요청하고, 응답 seed를 2페이지 요청에 보낸다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    const first = h.router.calls(RANDOM_P1);
    expect(first).toHaveLength(1);
    expect(first[0]!.query.has('randomSeed')).toBe(false);
    await finish(h, vm.onSentinelVisible());
    expect(h.router.calls(RANDOM_P2)).toHaveLength(1);
    expect(h.router.calls(RANDOM_P2)[0]!.query.get('page')).toBe('2');
    expect(ready(vm).posts).toHaveLength(27);
  });

  it('TC-DISP-017 첫 페이지 재검증은 기존 seed를 보내고 같은 seed의 뒤쪽 페이지는 유지한다', async () => {
    const h = createPostHarness({ routes: { [RANDOM_P1_SEEDED]: 'display/posts-list__random-page1-seed' } });
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.onTabReselect());
    expect(h.router.calls(RANDOM_P1_SEEDED)).toHaveLength(1);
    expect(ready(vm).posts).toHaveLength(27);
    expect(h.router.calls(RANDOM_P2)).toHaveLength(1); // 뒤쪽 페이지는 다시 부르지 않는다
  });

  it('TC-DISP-017 재검증 응답의 seed가 바뀌면 뒤쪽 페이지를 버리고 새 seed로 이어 간다', async () => {
    const page1 = loadFixture('display/posts-list__random-page1-seed.json').json as object;
    const h = createPostHarness({
      routes: {
        [RANDOM_P1_SEEDED]: () => json(200, { ...page1, randomSeed: 'seed_new' }),
        [postsKey(TODAY, 'random', 2, 'seed_new')]: 'display/posts-list__random-page2',
      },
    });
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.onTabReselect());
    expect(ready(vm).posts).toHaveLength(20);
    expect(ready(vm).hasNext).toBe(true);
    await finish(h, vm.onSentinelVisible());
    expect(h.router.calls(postsKey(TODAY, 'random', 2, 'seed_new'))).toHaveLength(1);
  });

  it('TC-DISP-045 상세에서 돌아와(onHidden → onShown) 재검증해도 seed와 페이지 꼬리를 유지한다', async () => {
    const h = createPostHarness({ routes: { [RANDOM_P1_SEEDED]: 'display/posts-list__random-page1-seed' } });
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.onSentinelVisible());
    vm.onHidden();
    await finish(h, vm.onShown());
    expect(h.router.calls(RANDOM_P1_SEEDED)).toHaveLength(1);
    expect(ready(vm).posts).toHaveLength(27);
  });

  it('TC-DISP-018 F5 랜덤에서 최신·인기로 바꾸면 요청에 randomSeed가 없다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.selectSort('recent'));
    await finish(h, vm.selectSort('popular'));
    const others = postsRequests(h).filter((c) => c.query.get('sort') !== 'random');
    expect(others.length).toBeGreaterThanOrEqual(2);
    expect(others.every((c) => !c.query.has('randomSeed'))).toBe(true);
  });

  it('TC-DISP-019 F4 응답에 randomSeed가 없으면 2페이지 요청을 보내지 않는다(오류·토스트도 없다)', async () => {
    const h = createPostHarness({ routes: { [RANDOM_P1]: 'display/posts-list__random-no-seed' } });
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    const calls = h.ff.calls.length;
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.onSentinelVisible());
    expect(h.ff.calls).toHaveLength(calls);
    expect(ready(vm).posts).toHaveLength(20);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-DISP-020 랜덤 페이지 경계의 중복 id는 제거한다', async () => {
    const h = createPostHarness({ routes: { [RANDOM_P2]: 'display/posts-list__random-page2-overlap' } });
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.onSentinelVisible());
    const all = ids(ready(vm).posts);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(25); // 207·212가 겹친다
  });

  it('TC-DISP-021 F3 날짜를 바꾸면 새 날짜 첫 페이지는 seed 없이 요청된다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm, { sort: 'random' });
    await finish(h, vm.selectPreviousDate());
    const yesterday = postsRequests(h).filter((c) => c.query.get('topicDate') === YESTERDAY);
    expect(yesterday).toHaveLength(1);
    expect(yesterday[0]!.query.has('randomSeed')).toBe(false);
  });
});

describe('DisplayViewModel 페이징 (REQ-DISP-007, 008, D-20)', () => {
  it('TC-DISP-022 끝 임계에서 다음 페이지를 1회만 요청하고 이어 붙인다(진행 중 중복 호출 없음)', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [RECENT_P2]: gated(gate, 'display/posts-list__recent-page2') } });
    const vm = h.display();
    await openToday(h, vm);
    const first = vm.onSentinelVisible();
    await settle();
    expect(ready(vm).paging).toBe(true);
    const second = vm.onSentinelVisible();
    void vm.onLastVisibleIndexChanged(19);
    await settle();
    expect(h.router.calls(RECENT_P2)).toHaveLength(1);
    gate.resolve();
    await finish(h, Promise.all([first, second]));
    expect(ready(vm)).toMatchObject({ paging: false, hasNext: false });
    expect(ids(ready(vm).posts)).toEqual(RECENT_IDS.concat(range(221, 227)));
  });

  it('REQ-DISP-007 마지막으로 보이는 인덱스가 길이-3 이상일 때만 다음 페이지를 요청한다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onLastVisibleIndexChanged(16));
    expect(h.router.calls(RECENT_P2)).toHaveLength(0);
    await finish(h, vm.onLastVisibleIndexChanged(17));
    expect(h.router.calls(RECENT_P2)).toHaveLength(1);
  });

  it('TC-DISP-023 hasNext=false면 끝에 닿아도 요청이 없다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onSentinelVisible());
    const calls = h.ff.calls.length;
    await finish(h, vm.onSentinelVisible());
    expect(h.ff.calls).toHaveLength(calls);
  });

  it('TC-DISP-023 F9 범위 밖 페이지의 빈 응답(hasNext=false)도 오류 없이 처리한다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P2]: 'display/posts-list__page99-empty' } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onSentinelVisible());
    expect(ready(vm)).toMatchObject({ hasNext: false, paging: false });
    expect(ready(vm).posts).toHaveLength(20);
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-DISP-024 첫 페이지 재검증 진행 중에는 다음 페이지를 요청하지 않는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.router.set(RECENT_P1, gated(gate, 'display/posts-list__recent-page1'));
    const revalidating = vm.onTabReselect();
    await settle();
    expect(ready(vm).refreshing).toBe(true);
    await vm.onSentinelVisible();
    expect(h.router.calls(RECENT_P2)).toHaveLength(0);
    gate.resolve();
    await finish(h, revalidating);
  });

  it('TC-DISP-025 2페이지까지 캐시한 뒤 첫 페이지만 재검증해도 다음 페이지는 유지된다(최신순)', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onSentinelVisible());
    await finish(h, vm.onTabReselect());
    expect(ready(vm).posts).toHaveLength(27);
    expect(h.router.calls(RECENT_P2)).toHaveLength(1);
    expect(h.router.calls(RECENT_P1)).toHaveLength(2);
  });

  it('TC-DISP-026 다음 페이지 실패는 토스트만 띄우고, 다시 끝에 닿으면 같은 page를 다시 요청한다', async () => {
    let failing = true;
    const h = createPostHarness({ routes: { [RECENT_P2]: failWhile(() => failing, 'display/posts-list__500-server-error', 'display/posts-list__recent-page2') } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onSentinelVisible());
    expect(h.toasts.messages).toEqual([t('display.error')]);
    expect(vm.state.body.status).toBe('ready');
    expect(ready(vm)).toMatchObject({ paging: false, hasNext: true, pageFailures: 1 });
    expect(ready(vm).posts).toHaveLength(20);
    failing = false;
    const before = h.router.calls(RECENT_P2).length;
    await finish(h, vm.onSentinelVisible());
    expect(h.router.calls(RECENT_P2).length - before).toBe(1);
    expect(h.router.calls(RECENT_P2).at(-1)!.query.get('page')).toBe('2');
    expect(ready(vm).posts).toHaveLength(27);
  });

  it('TC-DISP-027 오프셋이 밀려 겹친 항목은 id 기준으로 한 번만 둔다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P2]: 'display/posts-list__recent-page2-overlap' } });
    const vm = h.display();
    await openToday(h, vm);
    await finish(h, vm.onSentinelVisible());
    const all = ids(ready(vm).posts);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(RECENT_IDS.concat(range(221, 226)));
  });
});

describe('DisplayViewModel 재검증 실패와 stale (D-20, D-04)', () => {
  it('TC-DISP-010 이미 사진이 보이면 재검증 실패는 콘텐츠를 유지하고 토스트만 띄운다(5xx)', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.router.set(RECENT_P1, 'display/posts-list__500-server-error');
    await finish(h, vm.onTabReselect());
    expect(vm.state.body.status).toBe('ready');
    expect(ready(vm).posts).toHaveLength(20);
    expect(ready(vm).refreshing).toBe(false);
    expect(h.toasts.messages).toEqual([t('display.error')]);
  });

  it('TC-DISP-010 연결 실패면 common.error.network 토스트다', async () => {
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.router.set(RECENT_P1, () => Promise.reject(new TypeError('Failed to fetch')));
    await finish(h, vm.onTabReselect());
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([t('common.error.network')]);
  });

  it('TC-DISP-044 재검증이 성공하면 기존 전시를 유지하다가 최신 값으로 교체한다', async () => {
    const page = loadFixture('display/posts-list__recent-page1.json').json as { posts: { id: string }[] };
    const gate = deferred<void>();
    const h = createPostHarness();
    const vm = h.display();
    await openToday(h, vm);
    h.router.set(RECENT_P1, async () => {
      await gate.promise;
      return json(200, { ...page, posts: page.posts.map((p, i) => (i === 0 ? { ...p, likeCount: 99 } : p)) });
    });
    const revalidating = vm.onTabReselect();
    await settle();
    expect(ready(vm).posts[0]!.likeCount).toBe(38);
    expect(ready(vm).refreshing).toBe(true);
    gate.resolve();
    await finish(h, revalidating);
    expect(ready(vm).posts[0]!.likeCount).toBe(99);
    expect(ready(vm).refreshing).toBe(false);
  });

  it('TC-DISP-047 정렬 A→B 빠른 전환: A의 늦은 응답은 B 화면을 덮지 않고 A 캐시에만 남는다', async () => {
    const gate = deferred<void>();
    const h = createPostHarness({ routes: { [POPULAR_P1]: gated(gate, 'display/posts-list__popular-page1') } });
    const vm = h.display();
    await openToday(h, vm);
    const a = vm.selectSort('popular');
    await settle();
    const b = vm.selectSort('recent');
    await finish(h, b);
    gate.resolve();
    await finish(h, a);
    expect(vm.state.sort).toBe('recent');
    expect(ids(ready(vm).posts)).toEqual(RECENT_IDS);
    expect(ready(vm).refreshing).toBe(false);
    const again = vm.selectSort('popular'); // A 캐시: 네트워크를 기다리지 않고 바로
    expect(ids(ready(vm).posts)).toEqual(POPULAR_IDS);
    await finish(h, again);
  });
});

describe('DisplayViewModel 인증·재시도 (REQ-DISP-004, D-21)', () => {
  it('TC-DISP-051 만료 토큰으로 401이면 refresh 뒤 한 번 재전송한다', async () => {
    const h = createPostHarness({
      routes: {
        [RECENT_P1]: ['display/posts-list__401-unauthorized', 'display/posts-list__recent-page1'],
        'POST /auth/refresh': 'auth/refresh__success',
      },
    });
    const vm = h.display();
    await openToday(h, vm);
    expect(h.router.calls('POST /auth/refresh')).toHaveLength(1);
    expect(h.router.calls(RECENT_P1)).toHaveLength(2);
    expect(vm.state.body.status).toBe('ready');
  });

  it('TC-DISP-052 503은 GET이라 재시도해서 성공하면 토스트·오류 없이 보인다(0.5초 단위로 가상 시간만 흐른다)', async () => {
    const h = createPostHarness({ routes: { [RECENT_P1]: ['display/posts-list__503-retry-after', 'display/posts-list__recent-page1'] } });
    const vm = h.display();
    await openToday(h, vm);
    expect(h.router.calls(RECENT_P1).length).toBeGreaterThanOrEqual(2);
    expect(vm.state.body.status).toBe('ready');
    expect(h.toasts.messages).toEqual([]);
  });

  it('TC-DISP-052 재시도를 모두 소진한 503은 최초 로딩이면 오류 화면이다', async () => {
    const h = createPostHarness({ routes: { [RECENT_P1]: 'display/posts-list__503-retry-after' } });
    const vm = h.display();
    await openToday(h, vm);
    expect(h.router.calls(RECENT_P1)).toHaveLength(3); // 최초 + 재시도 2회
    expect(vm.state.body).toEqual({ status: 'error', network: false });
  });

  it('topics 라우트가 먼저 불리고 posts는 그 뒤다(회원도 같다)', async () => {
    const h = createPostHarness({ routes: { [topicKey(TODAY)]: 'display/topics__open-2026-10-27' } });
    const vm = h.display();
    await openToday(h, vm, { sort: 'popular' });
    expect(h.ff.calls.map((c) => c.path)).toEqual(['/topics', '/posts']);
  });
});
